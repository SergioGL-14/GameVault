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
import type { LibraryRepository } from './library/sqlite-library'

/** Registers the narrow desktop API and validates every renderer-supplied argument before use. */
export function registerIpc(
  repo: LibraryRepository,
  steamCatalog: GameCatalog,
  rawgCatalog: AuthenticatedGameCatalog,
  catalogKey: CatalogKeyStore
): void {
  function positiveInteger(value: unknown, label: string): asserts value is number {
    if (!Number.isInteger(value) || (value as number) <= 0) {
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
      return {
        ok: false,
        error:
          reason instanceof CatalogError ? reason.failure : { provider, kind: 'provider-response' }
      }
    }
  }

  ipcMain.handle(IPC.listGames, () => repo.listGames())
  ipcMain.handle(IPC.createGame, (_event, input: unknown) => {
    validateGameInput(input)
    return repo.createGame(input)
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
      if (typeof query !== 'string' || query.trim().length < 2) {
        throw new CatalogError({ provider: selected.provider, kind: 'invalid-input' })
      }
      return selected.catalog.search(query)
    })
  })
  ipcMain.handle(IPC.getCatalogGame, (_event, provider: unknown, catalogId: unknown) => {
    const selected = catalogFor(provider)
    return catalogResult(selected.provider, () => {
      if (!Number.isInteger(catalogId) || (catalogId as number) <= 0) {
        throw new CatalogError({ provider: selected.provider, kind: 'invalid-input' })
      }
      return selected.catalog.getGame(catalogId as number)
    })
  })
}
