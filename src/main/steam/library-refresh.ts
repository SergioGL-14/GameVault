import { randomUUID } from 'node:crypto'
import {
  CatalogError,
  type CatalogFailure,
  type CatalogGameDetail,
  type CatalogResult,
  type GameCatalog
} from '../../catalog/model'
import { reconcileSteamOwnership } from '../../library/ownership'
import { isUsableGameCard } from '../../library/game-metadata'
import type {
  ApplySteamRefreshInput,
  SteamAccountProvider,
  SteamAchievementRefresh,
  SteamConnectionStatus,
  SteamCredential,
  SteamMetadataRefresh,
  SteamMetadataProgress,
  SteamOwnedGame,
  SteamRefreshItem,
  SteamRefreshPreview,
  SteamRefreshApplication,
  SteamWebSession
} from '../../steam/model'
import type { LibraryRepository } from '../library/sqlite-library'
import type { SteamKeyStore } from './key-store'
import { SecureStorageError } from '../secure-key-store'

export interface SteamLibraryRefresh {
  status(): SteamConnectionStatus
  connectWeb(): Promise<CatalogResult<SteamConnectionStatus>>
  connectWithApiKey(
    profileInput: string,
    key: string
  ): Promise<CatalogResult<SteamConnectionStatus>>
  disconnect(): Promise<SteamConnectionStatus>
  preview(): Promise<CatalogResult<SteamRefreshPreview>>
  apply(input: ApplySteamRefreshInput): Promise<CatalogResult<SteamRefreshApplication>>
  refreshMetadata(
    onProgress?: (progress: SteamMetadataProgress) => void
  ): Promise<CatalogResult<SteamMetadataRefresh>>
  cancelMetadata(): void
  refreshAchievements(): Promise<CatalogResult<SteamAchievementRefresh>>
}

/** Coordinates one authoritative Steam snapshot without trusting snapshot data from the renderer. */
export function createSteamLibraryRefresh(
  repo: LibraryRepository,
  keys: SteamKeyStore,
  provider: SteamAccountProvider,
  webSession: SteamWebSession,
  metadata: GameCatalog
): SteamLibraryRefresh {
  let pending: {
    id: string
    games: SteamOwnedGame[]
    items: SteamRefreshItem[]
    librarySignature: string
    createdAt: number
  } | null = null
  let activeMetadata: Promise<CatalogResult<SteamMetadataRefresh>> | null = null
  let metadataController: AbortController | null = null

  async function stopMetadata(): Promise<void> {
    metadataController?.abort()
    await activeMetadata?.catch(() => undefined)
  }

  function librarySignature(): string {
    return JSON.stringify(
      repo.listGames().map(({ id, source, catalogId, title, ownedOn }) => ({
        id,
        source,
        catalogId,
        title,
        ownedOn
      }))
    )
  }

  function status(): SteamConnectionStatus {
    const credential = keys.status()
    const account = repo.getSteamAccount()
    return {
      configured: account !== null,
      credentialSource: account
        ? credential.source === 'saved'
          ? 'api-key'
          : 'web-session'
        : null,
      account
    }
  }

  function catalogFailure(reason: unknown): CatalogFailure {
    return reason instanceof CatalogError
      ? reason.failure
      : { provider: 'steam' as const, kind: 'provider-response' as const }
  }

  async function result<T>(operation: () => T | Promise<T>): Promise<CatalogResult<T>> {
    try {
      return { ok: true, value: await operation() }
    } catch (reason) {
      return {
        ok: false,
        error:
          reason instanceof CatalogError
            ? reason.failure
            : reason instanceof SecureStorageError
              ? { provider: 'steam', kind: 'secure-storage' }
              : { provider: 'steam', kind: 'provider-response' }
      }
    }
  }

  return {
    status,
    connectWeb() {
      return result(async () => {
        const authentication = await webSession.login()
        await stopMetadata()
        const profile = {
          steamId: authentication.steamId,
          personaName: 'Cuenta de Steam',
          avatarUrl: null
        }
        const previousKey = keys.status().source === 'saved' ? keys.get() : null
        keys.clear()
        try {
          repo.connectSteamAccount(profile)
        } catch (reason) {
          if (previousKey !== null) keys.save(previousKey)
          throw reason
        }
        pending = null
        return status()
      })
    },
    connectWithApiKey(profileInput, key) {
      return result(async () => {
        const credential: SteamCredential = { kind: 'api-key', value: key }
        const profile = await provider.resolveProfile(profileInput, credential)
        await stopMetadata()
        await webSession.clear()
        const previousKey = keys.status().source === 'saved' ? keys.get() : null
        keys.save(key)
        try {
          repo.connectSteamAccount(profile)
        } catch (reason) {
          if (previousKey === null) keys.clear()
          else keys.save(previousKey)
          throw reason
        }
        pending = null
        return status()
      })
    },
    async disconnect() {
      await stopMetadata()
      await webSession.clear()
      keys.clear()
      repo.disconnectSteamAccount()
      pending = null
      return status()
    },
    preview() {
      return result(async () => {
        const account = repo.getSteamAccount()
        const key = keys.get()
        if (!account) throw new CatalogError({ provider: 'steam', kind: 'authentication' })
        let credential: SteamCredential
        if (key) credential = { kind: 'api-key', value: key }
        else {
          const authentication = await webSession.restore()
          if (authentication.steamId !== account.steamId) {
            throw new CatalogError({ provider: 'steam', kind: 'authentication' })
          }
          credential = authentication.credential
        }
        const games = await provider.getLibraryGames(account.steamId, credential)
        const canonicalGames = repo.listGames()
        const ownerships = new Map(
          repo.listSteamOwnerships().map((item) => [item.appId, item.gameId])
        )
        const items: SteamRefreshItem[] = games.map((game) => {
          const match = reconcileSteamOwnership(game, canonicalGames, ownerships.get(game.appId))
          if (match.kind === 'new-game') return { kind: 'new', game }
          if (match.kind === 'title-confirmation') {
            return {
              kind: 'confirmation',
              game,
              candidates: match.gameIds.map((gameId) => ({
                gameId,
                title: canonicalGames.find((candidate) => candidate.id === gameId)?.title ?? ''
              }))
            }
          }
          const canonical = canonicalGames.find((candidate) => candidate.id === match.gameId)
          if (!canonical) throw new Error('Canonical game disappeared during preview')
          return { kind: 'existing', game, gameId: canonical.id, canonicalTitle: canonical.title }
        })
        pending = {
          id: randomUUID(),
          games,
          items,
          librarySignature: librarySignature(),
          createdAt: Date.now()
        }
        return { previewId: pending.id, items }
      })
    },
    apply(input) {
      return result(async () => {
        if (
          !pending ||
          input.previewId !== pending.id ||
          Date.now() - pending.createdAt > 15 * 60 * 1000 ||
          pending.librarySignature !== librarySignature()
        )
          throw new CatalogError({ provider: 'steam', kind: 'stale-preview' })
        const supplied = new Map(input.resolutions.map((item) => [item.appId, item.gameId]))
        const resolutions = pending.items.map((item) => {
          if (item.kind === 'existing') return { appId: item.game.appId, gameId: item.gameId }
          if (item.kind === 'new') return { appId: item.game.appId, gameId: null }
          const gameId = supplied.get(item.game.appId)
          if (
            gameId === undefined ||
            (gameId !== null && !item.candidates.some((c) => c.gameId === gameId))
          ) {
            throw new CatalogError({ provider: 'steam', kind: 'invalid-input' })
          }
          return { appId: item.game.appId, gameId }
        })
        const account = repo.getSteamAccount()
        if (!account) throw new CatalogError({ provider: 'steam', kind: 'authentication' })
        const snapshot = pending.games
        repo.applySteamOwnershipSnapshot(snapshot, resolutions)
        pending = null

        return { games: repo.listGames() }
      })
    },
    refreshMetadata(onProgress) {
      if (activeMetadata) return activeMetadata
      const controller = new AbortController()
      metadataController = controller
      const operation = (async (): Promise<CatalogResult<SteamMetadataRefresh>> => {
        if (!repo.getSteamAccount()) {
          return { ok: false, error: { provider: 'steam', kind: 'authentication' } }
        }
        const gamesById = new Map(repo.listGames().map((game) => [game.id, game]))
        const ownerships = repo.listPendingSteamMetadata()
        const failures: SteamMetadataRefresh['failures'] = []
        let metadataUpdated = 0
        let processed = 0
        const emit = (
          status: SteamMetadataProgress['status'],
          currentTitle: string | null
        ): void => {
          try {
            onProgress?.({
              status,
              currentTitle,
              processed,
              total: ownerships.length,
              metadataUpdated,
              failed: failures.length,
              pending: ownerships.length - processed
            })
          } catch {
            // Renderer progress is observational and cannot change persisted import behavior.
          }
        }
        for (const ownership of ownerships) {
          if (controller.signal.aborted) break
          const title = gamesById.get(ownership.gameId)?.title ?? `Steam App ${ownership.appId}`
          emit('running', title)
          let detail: CatalogGameDetail
          try {
            detail = await metadata.getGame(ownership.appId, controller.signal)
          } catch (reason) {
            if (controller.signal.aborted) break
            if (!(reason instanceof CatalogError)) {
              emit('failed', null)
              throw reason
            }
            const error = catalogFailure(reason)
            failures.push({ appId: ownership.appId, title, error })
            processed += 1
            emit('running', title)
            if (
              error.kind === 'rate-limit' ||
              error.kind === 'authentication' ||
              error.kind === 'offline' ||
              error.kind === 'timeout'
            ) {
              break
            }
            continue
          }
          if (controller.signal.aborted) break
          try {
            const updated = repo.applySteamMetadata(ownership.appId, detail)
            if (isUsableGameCard(updated)) metadataUpdated += 1
            else {
              failures.push({
                appId: ownership.appId,
                title,
                error: { provider: 'steam', kind: 'provider-response' }
              })
            }
          } catch (reason) {
            emit('failed', null)
            throw reason
          }
          processed += 1
          emit('running', title)
        }
        const cancelled = controller.signal.aborted
        const value = {
          games: repo.listGames(),
          metadataUpdated,
          failures,
          pending: ownerships.length - processed,
          cancelled
        }
        emit(cancelled ? 'cancelled' : 'completed', null)
        return { ok: true, value }
      })()
      activeMetadata = operation
      void operation
        .finally(() => {
          if (activeMetadata === operation) activeMetadata = null
          if (metadataController === controller) metadataController = null
        })
        .catch(() => undefined)
      return operation
    },
    cancelMetadata() {
      metadataController?.abort()
    },
    refreshAchievements() {
      return result(async () => {
        const account = repo.getSteamAccount()
        if (!account) throw new CatalogError({ provider: 'steam', kind: 'authentication' })
        const connectedAccount = account
        const key = keys.get()
        const authentication = key ? null : await webSession.restore()
        if (authentication && authentication.steamId !== account.steamId) {
          throw new CatalogError({ provider: 'steam', kind: 'authentication' })
        }
        const credential: SteamCredential = key
          ? { kind: 'api-key', value: key }
          : authentication!.credential
        const activeGameIds = new Set(
          repo
            .listGames()
            .filter((game) => game.ownedOn.includes('steam'))
            .map((game) => game.id)
        )
        const ownerships = repo
          .listSteamOwnerships()
          .filter((ownership) => activeGameIds.has(ownership.gameId))
        let gamesUpdated = 0
        const failures: SteamAchievementRefresh['failures'] = []
        const gamesById = new Map(repo.listGames().map((game) => [game.id, game]))
        let processed = 0
        for (const ownership of ownerships) {
          try {
            const achievements = await provider.getAchievements(
              connectedAccount.steamId,
              ownership.appId,
              credential
            )
            repo.applySteamAchievementSnapshot(ownership.appId, achievements)
            gamesUpdated += 1
          } catch (reason) {
            const error = catalogFailure(reason)
            failures.push({
              appId: ownership.appId,
              title: gamesById.get(ownership.gameId)?.title ?? `Steam App ${ownership.appId}`,
              error
            })
            processed += 1
            if (error.kind === 'rate-limit' || error.kind === 'authentication') break
            continue
          }
          processed += 1
        }
        return { gamesUpdated, failures, pending: ownerships.length - processed }
      })
    }
  }
}
