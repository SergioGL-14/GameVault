import { ipcMain } from 'electron'
import {
  CatalogError,
  type AuthenticatedGameCatalog,
  type CatalogProvider,
  type CatalogResult,
  type GameCatalog
} from '../catalog/model'
import { IPC } from '../desktop-api'
import {
  ValidationError,
  validateAchievementInput,
  validateGameInput,
  validateProfileInput
} from '../library/validation'
import type { CatalogKeyStore } from './catalog/rawg-key-store'
import { ManagedImageError } from './images/managed-images'
import type { LibraryRepository } from './library/sqlite-library'
import type { SteamLibraryRefresh } from './steam/library-refresh'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Registers the narrow desktop API and validates every renderer-supplied argument before use. */
export function registerIpc(
  repo: LibraryRepository,
  steamCatalog: GameCatalog,
  rawgCatalog: AuthenticatedGameCatalog,
  catalogKey: CatalogKeyStore,
  selectLocalImage: () => Promise<string | null>,
  steamLibrary: SteamLibraryRefresh
): void {
  function positiveInteger(value: unknown, label: string): asserts value is number {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new ValidationError(`${label} no es válido`)
    }
  }

  function catalogFor(provider: unknown): { provider: CatalogProvider; catalog: GameCatalog } {
    if (provider === 'steam') return { provider, catalog: steamCatalog }
    if (provider === 'rawg') return { provider, catalog: rawgCatalog }
    throw new Error('Proveedor de catálogo no válido')
  }

  async function catalogResult<T>(
    provider: CatalogProvider,
    operation: () => T | Promise<T>
  ): Promise<CatalogResult<T>> {
    try {
      return { ok: true, value: await operation() }
    } catch (reason) {
      if (reason instanceof ManagedImageError && reason.kind === 'persistence') throw reason
      return {
        ok: false,
        error:
          reason instanceof CatalogError ? reason.failure : { provider, kind: 'provider-response' }
      }
    }
  }

  ipcMain.handle(IPC.selectLocalImage, () => selectLocalImage())
  ipcMain.handle(IPC.steamConnection, () => steamLibrary.status())
  ipcMain.handle(IPC.connectSteamWeb, () => steamLibrary.connectWeb())
  ipcMain.handle(IPC.connectSteamApiKey, (_event, profileInput: unknown, key: unknown) => {
    if (
      typeof profileInput !== 'string' ||
      !profileInput.trim() ||
      profileInput.length > 512 ||
      typeof key !== 'string' ||
      !key.trim() ||
      key.length > 256
    ) {
      throw new ValidationError('La conexión de Steam no es válida')
    }
    return steamLibrary.connectWithApiKey(profileInput, key)
  })
  ipcMain.handle(IPC.disconnectSteam, () => steamLibrary.disconnect())
  ipcMain.handle(IPC.previewSteamRefresh, () => steamLibrary.preview())
  ipcMain.handle(IPC.applySteamRefresh, (_event, input: unknown) => {
    if (
      !isRecord(input) ||
      typeof input.previewId !== 'string' ||
      !Array.isArray(input.resolutions)
    ) {
      throw new ValidationError('La confirmación de Steam no es válida')
    }
    if (input.previewId.length > 128 || input.resolutions.length > 100_000) {
      throw new ValidationError('La confirmación de Steam no es válida')
    }
    const seen = new Set<number>()
    const resolutions = input.resolutions.map((value) => {
      if (!isRecord(value)) throw new ValidationError('La confirmación de Steam no es válida')
      positiveInteger(value.appId, 'El identificador de Steam')
      if (value.gameId !== null) positiveInteger(value.gameId, 'El identificador del juego')
      if (seen.has(value.appId))
        throw new ValidationError('La confirmación de Steam está duplicada')
      seen.add(value.appId)
      return { appId: value.appId, gameId: value.gameId }
    })
    return steamLibrary.apply({ previewId: input.previewId, resolutions })
  })
  ipcMain.handle(IPC.refreshSteamMetadata, (event) =>
    steamLibrary.refreshMetadata((progress) =>
      event.sender.send(IPC.steamMetadataProgress, progress)
    )
  )
  ipcMain.handle(IPC.cancelSteamMetadata, () => steamLibrary.cancelMetadata())
  ipcMain.handle(IPC.refreshSteamAchievements, () => steamLibrary.refreshAchievements())
  ipcMain.handle(IPC.listGames, () => repo.listGames())
  ipcMain.handle(IPC.createGame, (_event, input: unknown) => {
    validateGameInput(input)
    return repo.addGame(input)
  })
  ipcMain.handle(IPC.updateGame, (_event, id: unknown, input: unknown) => {
    positiveInteger(id, 'El identificador del juego')
    validateGameInput(input)
    return repo.updateGame(id, input)
  })
  ipcMain.handle(IPC.deleteGame, (_event, id: unknown) => {
    positiveInteger(id, 'El identificador del juego')
    return repo.deleteGame(id)
  })
  ipcMain.handle(IPC.listAchievements, (_event, gameId: unknown) => {
    positiveInteger(gameId, 'El identificador del juego')
    return repo.listAchievements(gameId)
  })
  ipcMain.handle(IPC.createAchievement, (_event, gameId: unknown, input: unknown) => {
    positiveInteger(gameId, 'El identificador del juego')
    validateAchievementInput(input)
    return repo.createAchievement(gameId, input)
  })
  ipcMain.handle(IPC.updateAchievement, (_event, id: unknown, input: unknown) => {
    positiveInteger(id, 'El identificador del logro')
    validateAchievementInput(input)
    return repo.updateAchievement(id, input)
  })
  ipcMain.handle(IPC.clearAchievementOverride, (_event, id: unknown) => {
    positiveInteger(id, 'El identificador del logro')
    return repo.clearAchievementOverride(id)
  })
  ipcMain.handle(IPC.deleteAchievement, (_event, id: unknown) => {
    positiveInteger(id, 'El identificador del logro')
    return repo.deleteAchievement(id)
  })
  ipcMain.handle(IPC.getProfile, () => repo.getProfile())
  ipcMain.handle(IPC.updateProfile, (_event, input: unknown) => {
    validateProfileInput(input)
    return repo.updateProfile(input)
  })
  ipcMain.handle(IPC.getStats, () => repo.getStats())
  ipcMain.handle(IPC.catalogStatus, () => catalogKey.status())
  ipcMain.handle(IPC.saveCatalogKey, async (_event, key: unknown) => {
    const verified = await catalogResult('rawg', async () => {
      if (typeof key !== 'string') {
        throw new CatalogError({ provider: 'rawg', kind: 'invalid-input' })
      }
      const normalizedKey = key.trim()
      if (!normalizedKey || normalizedKey.length > 256) {
        throw new CatalogError({ provider: 'rawg', kind: 'invalid-input' })
      }
      await rawgCatalog.verifyKey(normalizedKey)
      return normalizedKey
    })
    if (!verified.ok) return verified
    return { ok: true, value: catalogKey.save(verified.value) } as const
  })
  ipcMain.handle(IPC.clearCatalogKey, () => catalogKey.clear())
  ipcMain.handle(IPC.searchCatalog, (_event, provider: unknown, query: unknown) => {
    const selected = catalogFor(provider)
    return catalogResult(selected.provider, () => {
      if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 100) {
        throw new CatalogError({ provider: selected.provider, kind: 'invalid-input' })
      }
      return selected.catalog.search(query)
    })
  })
  ipcMain.handle(IPC.getCatalogGame, (_event, provider: unknown, catalogId: unknown) => {
    const selected = catalogFor(provider)
    return catalogResult(selected.provider, () => {
      if (!Number.isSafeInteger(catalogId) || (catalogId as number) <= 0) {
        throw new CatalogError({ provider: selected.provider, kind: 'invalid-input' })
      }
      return selected.catalog.getGame(catalogId as number)
    })
  })
  ipcMain.handle(IPC.refreshGameMetadata, async (_event, id: unknown) => {
    positiveInteger(id, 'El identificador del juego')
    const game = repo.getGame(id)
    if (!game || game.source === 'manual' || game.catalogId === null) {
      throw new ValidationError('El juego no tiene una identidad de catálogo')
    }
    const selected = catalogFor(game.source)
    const result = await catalogResult(selected.provider, () =>
      selected.catalog.getGame(game.catalogId as number)
    )
    if (!result.ok) return result
    if (result.value.source !== game.source || result.value.catalogId !== game.catalogId) {
      return {
        ok: false,
        error: { provider: selected.provider, kind: 'provider-response' as const }
      }
    }
    return { ok: true, value: repo.applyCatalogMetadata(id, result.value) }
  })
}
