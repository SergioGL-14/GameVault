import { ipcMain } from 'electron'
import type { AuthenticatedGameCatalog, GameCatalog } from '../catalog/model'
import { IPC } from '../desktop-api'
import { ValidationError, validateGameInput, validateProfileInput } from '../library/validation'
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

  function catalogFor(provider: unknown): GameCatalog {
    if (provider === 'steam') return steamCatalog
    if (provider === 'rawg') return rawgCatalog
    throw new Error('Proveedor de catálogo no válido')
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
  ipcMain.handle(IPC.getProfile, () => repo.getProfile())
  ipcMain.handle(IPC.updateProfile, (_event, input: unknown) => {
    validateProfileInput(input)
    return repo.updateProfile(input)
  })
  ipcMain.handle(IPC.getStats, () => repo.getStats())
  ipcMain.handle(IPC.catalogStatus, () => catalogKey.status())
  ipcMain.handle(IPC.saveCatalogKey, async (_event, key: unknown) => {
    if (typeof key !== 'string') {
      throw new ValidationError('La clave de RAWG no es válida')
    }
    const normalizedKey = key.trim()
    if (!normalizedKey || normalizedKey.length > 256) {
      throw new ValidationError('La clave de RAWG no es válida')
    }
    await rawgCatalog.verifyKey(normalizedKey)
    return catalogKey.save(normalizedKey)
  })
  ipcMain.handle(IPC.clearCatalogKey, () => catalogKey.clear())
  ipcMain.handle(IPC.searchCatalog, (_event, provider: unknown, query: unknown) => {
    const catalog = catalogFor(provider)
    if (typeof query !== 'string' || query.trim().length < 2) {
      throw new ValidationError('La búsqueda del catálogo no es válida')
    }
    return catalog.search(query)
  })
  ipcMain.handle(IPC.getCatalogGame, (_event, provider: unknown, catalogId: unknown) => {
    const catalog = catalogFor(provider)
    positiveInteger(catalogId, 'El identificador del catálogo')
    return catalog.getGame(catalogId)
  })
}
