import type {
  CatalogGameDetail,
  CatalogProvider,
  CatalogSearchResult,
  CatalogStatus
} from './catalog/model'
import type { Game, GameInput, LibraryStats, Profile, ProfileInput } from './library/model'

export const IPC = {
  listGames: 'games:list',
  createGame: 'games:create',
  updateGame: 'games:update',
  deleteGame: 'games:delete',
  getProfile: 'profile:get',
  updateProfile: 'profile:update',
  getStats: 'stats:get',
  catalogStatus: 'catalog:status',
  saveCatalogKey: 'catalog:key:save',
  clearCatalogKey: 'catalog:key:clear',
  searchCatalog: 'catalog:search',
  getCatalogGame: 'catalog:game'
} as const

export interface GameVaultApi {
  listGames: () => Promise<Game[]>
  createGame: (input: GameInput) => Promise<Game>
  updateGame: (id: number, input: GameInput) => Promise<Game>
  deleteGame: (id: number) => Promise<void>
  getProfile: () => Promise<Profile>
  updateProfile: (input: ProfileInput) => Promise<Profile>
  getStats: () => Promise<LibraryStats>
  getCatalogStatus: () => Promise<CatalogStatus>
  saveCatalogKey: (key: string) => Promise<CatalogStatus>
  clearCatalogKey: () => Promise<CatalogStatus>
  searchCatalog: (provider: CatalogProvider, query: string) => Promise<CatalogSearchResult[]>
  getCatalogGame: (provider: CatalogProvider, catalogId: number) => Promise<CatalogGameDetail>
}
