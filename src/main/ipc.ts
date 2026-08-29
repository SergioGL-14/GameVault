import { ipcMain } from 'electron'
import type { AuthenticatedGameCatalog, CatalogProvider, GameCatalog } from '../catalog/model'
import { IPC } from '../desktop-api'
import type { GameInput, ProfileInput } from '../library/model'
import type { CatalogKeyStore } from './catalog/rawg-key-store'
import type { LibraryRepository } from './library/sqlite-library'

export function registerIpc(
  repo: LibraryRepository,
  steamCatalog: GameCatalog,
  rawgCatalog: AuthenticatedGameCatalog,
  catalogKey: CatalogKeyStore
): void {
  function catalogFor(provider: CatalogProvider): GameCatalog {
    if (provider === 'steam') return steamCatalog
    if (provider === 'rawg') return rawgCatalog
    throw new Error('Proveedor de catálogo no válido')
  }

  ipcMain.handle(IPC.listGames, () => repo.listGames())
  ipcMain.handle(IPC.createGame, (_event, input: GameInput) => repo.createGame(input))
  ipcMain.handle(IPC.updateGame, (_event, id: number, input: GameInput) =>
    repo.updateGame(id, input)
  )
  ipcMain.handle(IPC.deleteGame, (_event, id: number) => repo.deleteGame(id))
  ipcMain.handle(IPC.getProfile, () => repo.getProfile())
  ipcMain.handle(IPC.updateProfile, (_event, input: ProfileInput) => repo.updateProfile(input))
  ipcMain.handle(IPC.getStats, () => repo.getStats())
  ipcMain.handle(IPC.catalogStatus, () => catalogKey.status())
  ipcMain.handle(IPC.saveCatalogKey, async (_event, key: string) => {
    await rawgCatalog.verifyKey(key)
    return catalogKey.save(key)
  })
  ipcMain.handle(IPC.clearCatalogKey, () => catalogKey.clear())
  ipcMain.handle(IPC.searchCatalog, (_event, provider: CatalogProvider, query: string) =>
    catalogFor(provider).search(query)
  )
  ipcMain.handle(IPC.getCatalogGame, (_event, provider: CatalogProvider, catalogId: number) =>
    catalogFor(provider).getGame(catalogId)
  )
}
