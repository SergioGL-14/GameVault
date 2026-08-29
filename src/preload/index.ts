import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC, type GameVaultApi } from '../shared/api'

const api: GameVaultApi = {
  listGames: () => ipcRenderer.invoke(IPC.listGames),
  createGame: (input) => ipcRenderer.invoke(IPC.createGame, input),
  updateGame: (id, input) => ipcRenderer.invoke(IPC.updateGame, id, input),
  deleteGame: (id) => ipcRenderer.invoke(IPC.deleteGame, id),
  getProfile: () => ipcRenderer.invoke(IPC.getProfile),
  updateProfile: (input) => ipcRenderer.invoke(IPC.updateProfile, input),
  getStats: () => ipcRenderer.invoke(IPC.getStats),
  getCatalogStatus: () => ipcRenderer.invoke(IPC.catalogStatus),
  saveCatalogKey: (key) => ipcRenderer.invoke(IPC.saveCatalogKey, key),
  clearCatalogKey: () => ipcRenderer.invoke(IPC.clearCatalogKey),
  searchCatalog: (provider, query) => ipcRenderer.invoke(IPC.searchCatalog, provider, query),
  getCatalogGame: (provider, catalogId) =>
    ipcRenderer.invoke(IPC.getCatalogGame, provider, catalogId)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
