import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC, type GameVaultApi } from '../desktop-api'

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { invoke: electron.invoke }
}))

let api: GameVaultApi

beforeAll(async () => {
  Object.defineProperty(process, 'contextIsolated', { configurable: true, value: true })
  await import('./index')
  expect(electron.exposeInMainWorld).toHaveBeenCalledWith('api', expect.any(Object))
  api = electron.exposeInMainWorld.mock.calls[0][1] as GameVaultApi
})

beforeEach(() => {
  electron.invoke.mockReset()
  electron.invoke.mockResolvedValue('result')
})

describe('preload desktop API', () => {
  it.each([
    ['listGames', IPC.listGames, []],
    ['createGame', IPC.createGame, [{ title: 'Celeste', status: 'pendiente' }]],
    ['updateGame', IPC.updateGame, [7, { title: 'Celeste', status: 'jugando' }]],
    ['deleteGame', IPC.deleteGame, [7]],
    ['listAchievements', IPC.listAchievements, [7]],
    ['createAchievement', IPC.createAchievement, [7, { name: 'Primer paso', unlocked: false }]],
    ['updateAchievement', IPC.updateAchievement, [9, { name: 'Primer paso', unlocked: true }]],
    ['deleteAchievement', IPC.deleteAchievement, [9]],
    ['getProfile', IPC.getProfile, []],
    [
      'updateProfile',
      IPC.updateProfile,
      [
        {
          displayName: 'Jugador',
          about: '',
          location: '',
          avatarUrl: null,
          backgroundUrl: null
        }
      ]
    ],
    ['getStats', IPC.getStats, []],
    ['getCatalogStatus', IPC.catalogStatus, []],
    ['saveCatalogKey', IPC.saveCatalogKey, ['key']],
    ['clearCatalogKey', IPC.clearCatalogKey, []],
    ['searchCatalog', IPC.searchCatalog, ['steam', 'Celeste']],
    ['getCatalogGame', IPC.getCatalogGame, ['rawg', 7]]
  ] as const)('%s invokes %s with the supplied arguments', async (method, channel, args) => {
    const result = await (api[method] as (...values: unknown[]) => Promise<unknown>)(...args)

    expect(electron.invoke).toHaveBeenCalledWith(channel, ...args)
    expect(result).toBe('result')
  })
})
