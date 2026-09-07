import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type GameVaultApi } from '../desktop-api'

const api: GameVaultApi = {
  selectLocalImage: () => ipcRenderer.invoke(IPC.selectLocalImage),
  listGames: () => ipcRenderer.invoke(IPC.listGames),
  createGame: (input) => ipcRenderer.invoke(IPC.createGame, input),
  updateGame: (id, input) => ipcRenderer.invoke(IPC.updateGame, id, input),
  deleteGame: (id) => ipcRenderer.invoke(IPC.deleteGame, id),
  listAchievements: (gameId) => ipcRenderer.invoke(IPC.listAchievements, gameId),
  createAchievement: (gameId, input) => ipcRenderer.invoke(IPC.createAchievement, gameId, input),
  updateAchievement: (id, input) => ipcRenderer.invoke(IPC.updateAchievement, id, input),
  clearAchievementOverride: (id) => ipcRenderer.invoke(IPC.clearAchievementOverride, id),
  deleteAchievement: (id) => ipcRenderer.invoke(IPC.deleteAchievement, id),
  getProfile: () => ipcRenderer.invoke(IPC.getProfile),
  updateProfile: (input) => ipcRenderer.invoke(IPC.updateProfile, input),
  getStats: () => ipcRenderer.invoke(IPC.getStats),
  getCatalogStatus: () => ipcRenderer.invoke(IPC.catalogStatus),
  saveCatalogKey: (key) => ipcRenderer.invoke(IPC.saveCatalogKey, key),
  clearCatalogKey: () => ipcRenderer.invoke(IPC.clearCatalogKey),
  searchCatalog: (provider, query) => ipcRenderer.invoke(IPC.searchCatalog, provider, query),
  getCatalogGame: (provider, catalogId) =>
    ipcRenderer.invoke(IPC.getCatalogGame, provider, catalogId),
  refreshGameMetadata: (id) => ipcRenderer.invoke(IPC.refreshGameMetadata, id),
  getSteamConnection: () => ipcRenderer.invoke(IPC.steamConnection),
  connectSteamWeb: () => ipcRenderer.invoke(IPC.connectSteamWeb),
  connectSteamApiKey: (profileInput, key) =>
    ipcRenderer.invoke(IPC.connectSteamApiKey, profileInput, key),
  disconnectSteam: () => ipcRenderer.invoke(IPC.disconnectSteam),
  previewSteamRefresh: () => ipcRenderer.invoke(IPC.previewSteamRefresh),
  applySteamRefresh: (input) => ipcRenderer.invoke(IPC.applySteamRefresh, input),
  refreshSteamMetadata: () => ipcRenderer.invoke(IPC.refreshSteamMetadata),
  refreshSteamAchievements: () => ipcRenderer.invoke(IPC.refreshSteamAchievements)
}

contextBridge.exposeInMainWorld('api', api)
