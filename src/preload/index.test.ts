import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC, type GameVaultApi } from '../desktop-api'

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener
  }
}))

let api: GameVaultApi

beforeAll(async () => {
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
    ['selectLocalImage', IPC.selectLocalImage, []],
    ['listGames', IPC.listGames, []],
    ['createGame', IPC.createGame, [{ title: 'Celeste', status: 'pendiente' }]],
    ['updateGame', IPC.updateGame, [7, { title: 'Celeste', status: 'jugando' }]],
    ['deleteGame', IPC.deleteGame, [7]],
    ['listAchievements', IPC.listAchievements, [7]],
    ['createAchievement', IPC.createAchievement, [7, { name: 'Primer paso', unlocked: false }]],
    ['updateAchievement', IPC.updateAchievement, [9, { name: 'Primer paso', unlocked: true }]],
    ['clearAchievementOverride', IPC.clearAchievementOverride, [9]],
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
    ['getCatalogGame', IPC.getCatalogGame, ['rawg', 7]],
    ['refreshGameMetadata', IPC.refreshGameMetadata, [7]],
    ['getSteamConnection', IPC.steamConnection, []],
    ['connectSteamWeb', IPC.connectSteamWeb, []],
    ['connectSteamApiKey', IPC.connectSteamApiKey, ['profile', 'key']],
    ['disconnectSteam', IPC.disconnectSteam, []],
    ['previewSteamRefresh', IPC.previewSteamRefresh, []],
    ['applySteamRefresh', IPC.applySteamRefresh, [{ previewId: 'id', resolutions: [] }]],
    ['refreshSteamMetadata', IPC.refreshSteamMetadata, []],
    ['cancelSteamMetadata', IPC.cancelSteamMetadata, []],
    ['refreshSteamAchievements', IPC.refreshSteamAchievements, []]
  ] as const)('%s invokes %s with the supplied arguments', async (method, channel, args) => {
    const result = await (api[method] as (...values: unknown[]) => Promise<unknown>)(...args)

    expect(electron.invoke).toHaveBeenCalledWith(channel, ...args)
    expect(result).toBe('result')
  })

  it('subscribes to typed Steam metadata progress and removes the same listener', () => {
    const listener = vi.fn()
    const unsubscribe = api.onSteamMetadataProgress(listener)
    const handler = electron.on.mock.calls[0][1]
    const progress = { status: 'running', processed: 1, total: 2 }

    handler({}, progress)
    unsubscribe()

    expect(listener).toHaveBeenCalledWith(progress)
    expect(electron.removeListener).toHaveBeenCalledWith(IPC.steamMetadataProgress, handler)
  })
})
