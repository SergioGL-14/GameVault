import type {
  CatalogGameDetail,
  CatalogProvider,
  CatalogResult,
  CatalogSearchResult,
  CatalogStatus
} from './catalog/model'
import type {
  AddGameResult,
  Achievement,
  AchievementInput,
  Game,
  GameInput,
  LibraryStats,
  Profile,
  ProfileInput
} from './library/model'
import type {
  ApplySteamRefreshInput,
  SteamAchievementRefresh,
  SteamConnectionStatus,
  SteamMetadataRefresh,
  SteamMetadataProgress,
  SteamRefreshApplication,
  SteamRefreshPreview
} from './steam/model'

export const IPC = {
  selectLocalImage: 'images:select-local',
  steamConnection: 'steam:connection',
  connectSteamWeb: 'steam:connect:web',
  connectSteamApiKey: 'steam:connect:api-key',
  disconnectSteam: 'steam:disconnect',
  previewSteamRefresh: 'steam:refresh:preview',
  applySteamRefresh: 'steam:refresh:apply',
  refreshSteamMetadata: 'steam:metadata:refresh',
  cancelSteamMetadata: 'steam:metadata:cancel',
  steamMetadataProgress: 'steam:metadata:progress',
  refreshSteamAchievements: 'steam:achievements:refresh',
  listGames: 'games:list',
  createGame: 'games:create',
  updateGame: 'games:update',
  deleteGame: 'games:delete',
  listAchievements: 'achievements:list',
  createAchievement: 'achievements:create',
  updateAchievement: 'achievements:update',
  clearAchievementOverride: 'achievements:clear-override',
  deleteAchievement: 'achievements:delete',
  getProfile: 'profile:get',
  updateProfile: 'profile:update',
  getStats: 'stats:get',
  catalogStatus: 'catalog:status',
  saveCatalogKey: 'catalog:key:save',
  clearCatalogKey: 'catalog:key:clear',
  searchCatalog: 'catalog:search',
  getCatalogGame: 'catalog:game',
  refreshGameMetadata: 'games:metadata:refresh'
} as const

export interface GameVaultApi {
  selectLocalImage: () => Promise<string | null>
  listGames: () => Promise<Game[]>
  createGame: (input: GameInput) => Promise<AddGameResult>
  updateGame: (id: number, input: GameInput) => Promise<Game>
  deleteGame: (id: number) => Promise<void>
  listAchievements: (gameId: number) => Promise<Achievement[]>
  createAchievement: (gameId: number, input: AchievementInput) => Promise<Achievement>
  updateAchievement: (id: number, input: AchievementInput) => Promise<Achievement>
  clearAchievementOverride: (id: number) => Promise<Achievement>
  deleteAchievement: (id: number) => Promise<void>
  getProfile: () => Promise<Profile>
  updateProfile: (input: ProfileInput) => Promise<Profile>
  getStats: () => Promise<LibraryStats>
  getCatalogStatus: () => Promise<CatalogStatus>
  saveCatalogKey: (key: string) => Promise<CatalogResult<CatalogStatus>>
  clearCatalogKey: () => Promise<CatalogStatus>
  searchCatalog: (
    provider: CatalogProvider,
    query: string
  ) => Promise<CatalogResult<CatalogSearchResult[]>>
  getCatalogGame: (
    provider: CatalogProvider,
    catalogId: number
  ) => Promise<CatalogResult<CatalogGameDetail>>
  refreshGameMetadata: (id: number) => Promise<CatalogResult<Game>>
  getSteamConnection: () => Promise<SteamConnectionStatus>
  connectSteamWeb: () => Promise<CatalogResult<SteamConnectionStatus>>
  connectSteamApiKey: (
    profileInput: string,
    key: string
  ) => Promise<CatalogResult<SteamConnectionStatus>>
  disconnectSteam: () => Promise<SteamConnectionStatus>
  previewSteamRefresh: () => Promise<CatalogResult<SteamRefreshPreview>>
  applySteamRefresh: (
    input: ApplySteamRefreshInput
  ) => Promise<CatalogResult<SteamRefreshApplication>>
  refreshSteamMetadata: () => Promise<CatalogResult<SteamMetadataRefresh>>
  cancelSteamMetadata: () => Promise<void>
  onSteamMetadataProgress: (listener: (progress: SteamMetadataProgress) => void) => () => void
  refreshSteamAchievements: () => Promise<CatalogResult<SteamAchievementRefresh>>
}
