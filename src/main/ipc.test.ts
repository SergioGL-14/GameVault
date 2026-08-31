import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedGameCatalog, GameCatalog } from '../catalog/model'
import { IPC } from '../desktop-api'
import type { LibraryRepository } from './library/sqlite-library'
import type { CatalogKeyStore } from './catalog/rawg-key-store'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const electron = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  handle: vi.fn((channel: string, handler: Handler) => {
    electron.handlers.set(channel, handler)
  })
}))

vi.mock('electron', () => ({ ipcMain: { handle: electron.handle } }))

import { registerIpc } from './ipc'

function method<T extends (...args: never[]) => unknown>(): ReturnType<typeof vi.fn<T>> {
  return vi.fn<T>()
}

const repo: LibraryRepository = {
  listGames: method<LibraryRepository['listGames']>(),
  createGame: method<LibraryRepository['createGame']>(),
  updateGame: method<LibraryRepository['updateGame']>(),
  deleteGame: method<LibraryRepository['deleteGame']>(),
  listAchievements: method<LibraryRepository['listAchievements']>(),
  createAchievement: method<LibraryRepository['createAchievement']>(),
  updateAchievement: method<LibraryRepository['updateAchievement']>(),
  deleteAchievement: method<LibraryRepository['deleteAchievement']>(),
  getProfile: method<LibraryRepository['getProfile']>(),
  updateProfile: method<LibraryRepository['updateProfile']>(),
  getStats: method<LibraryRepository['getStats']>()
}

const steamCatalog: GameCatalog = {
  search: method<GameCatalog['search']>(),
  getGame: method<GameCatalog['getGame']>()
}

const rawgCatalog: AuthenticatedGameCatalog = {
  search: method<AuthenticatedGameCatalog['search']>(),
  getGame: method<AuthenticatedGameCatalog['getGame']>(),
  verifyKey: method<AuthenticatedGameCatalog['verifyKey']>()
}

const catalogKey: CatalogKeyStore = {
  get: method<CatalogKeyStore['get']>(),
  status: method<CatalogKeyStore['status']>(),
  save: method<CatalogKeyStore['save']>(),
  clear: method<CatalogKeyStore['clear']>()
}

function invoke(channel: string, ...args: unknown[]): unknown {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
  return handler({}, ...args)
}

beforeEach(() => {
  vi.clearAllMocks()
  electron.handlers.clear()
  registerIpc(repo, steamCatalog, rawgCatalog, catalogKey)
})

describe('IPC registration', () => {
  it('registers every desktop API channel', () => {
    expect([...electron.handlers.keys()]).toEqual(Object.values(IPC))
  })

  it('forwards valid library calls', () => {
    const input = { title: 'Celeste', status: 'pendiente' } as const

    invoke(IPC.createGame, input)
    invoke(IPC.updateGame, 7, input)
    invoke(IPC.deleteGame, 7)

    expect(repo.createGame).toHaveBeenCalledWith(input)
    expect(repo.updateGame).toHaveBeenCalledWith(7, input)
    expect(repo.deleteGame).toHaveBeenCalledWith(7)
  })

  it('forwards valid achievement calls', () => {
    const input = { name: 'Primer paso', unlocked: false } as const

    invoke(IPC.listAchievements, 7)
    invoke(IPC.createAchievement, 7, input)
    invoke(IPC.updateAchievement, 9, input)
    invoke(IPC.deleteAchievement, 9)

    expect(repo.listAchievements).toHaveBeenCalledWith(7)
    expect(repo.createAchievement).toHaveBeenCalledWith(7, input)
    expect(repo.updateAchievement).toHaveBeenCalledWith(9, input)
    expect(repo.deleteAchievement).toHaveBeenCalledWith(9)
  })

  it('forwards valid profile and catalog calls', async () => {
    const profile = {
      displayName: 'Jugador',
      about: '',
      location: '',
      avatarUrl: null,
      backgroundUrl: null
    }

    invoke(IPC.updateProfile, profile)
    invoke(IPC.searchCatalog, 'steam', 'Celeste')
    invoke(IPC.getCatalogGame, 'rawg', 7)
    await invoke(IPC.saveCatalogKey, 'key')

    expect(repo.updateProfile).toHaveBeenCalledWith(profile)
    expect(steamCatalog.search).toHaveBeenCalledWith('Celeste')
    expect(rawgCatalog.getGame).toHaveBeenCalledWith(7)
    expect(rawgCatalog.verifyKey).toHaveBeenCalledWith('key')
    expect(catalogKey.save).toHaveBeenCalledWith('key')
  })
})

describe('IPC validation', () => {
  it.each([0, -1, 1.5, '7', null])('rejects malformed library ID %j', (id) => {
    expect(() => invoke(IPC.deleteGame, id)).toThrow('identificador del juego')
    expect(repo.deleteGame).not.toHaveBeenCalled()
  })

  it('rejects malformed game input', () => {
    expect(() => invoke(IPC.createGame, null)).toThrow('juego')
    expect(() => invoke(IPC.updateGame, 7, { title: 3, status: 'pendiente' })).toThrow('juego')
    expect(() =>
      invoke(IPC.createGame, { title: 'Celeste', status: 'pendiente', playtimeMinutes: null })
    ).toThrow('tiempo jugado')
    expect(repo.createGame).not.toHaveBeenCalled()
    expect(repo.updateGame).not.toHaveBeenCalled()
  })

  it.each([0, -1, 1.5, '9', null])('rejects malformed achievement ID %j', (id) => {
    expect(() => invoke(IPC.deleteAchievement, id)).toThrow('identificador del logro')
    expect(repo.deleteAchievement).not.toHaveBeenCalled()
  })

  it('rejects malformed achievement input before persistence', () => {
    expect(() => invoke(IPC.createAchievement, 7, null)).toThrow('logro')
    expect(() =>
      invoke(IPC.updateAchievement, 9, {
        name: 'Primer paso',
        unlocked: false,
        unlockedAt: '2026-08-31'
      })
    ).toThrow('bloqueado')
    expect(() => invoke(IPC.listAchievements, '7')).toThrow('identificador del juego')
    expect(repo.createAchievement).not.toHaveBeenCalled()
    expect(repo.updateAchievement).not.toHaveBeenCalled()
    expect(repo.listAchievements).not.toHaveBeenCalled()
  })

  it('rejects malformed profile input', () => {
    expect(() => invoke(IPC.updateProfile, null)).toThrow('perfil')
    expect(repo.updateProfile).not.toHaveBeenCalled()
  })

  it('rejects unknown catalog providers', () => {
    expect(() => invoke(IPC.searchCatalog, 'other', 'Celeste')).toThrow(
      'Proveedor de catálogo no válido'
    )
    expect(steamCatalog.search).not.toHaveBeenCalled()
    expect(rawgCatalog.search).not.toHaveBeenCalled()
  })

  it('rejects malformed catalog searches and keys', async () => {
    expect(() => invoke(IPC.searchCatalog, 'steam', ' ')).toThrow('búsqueda del catálogo')
    await expect(invoke(IPC.saveCatalogKey, null)).rejects.toThrow('clave de RAWG')
    expect(steamCatalog.search).not.toHaveBeenCalled()
    expect(rawgCatalog.verifyKey).not.toHaveBeenCalled()
  })

  it('normalizes a catalog key before verifying and saving it', async () => {
    await invoke(IPC.saveCatalogKey, '  key  ')

    expect(rawgCatalog.verifyKey).toHaveBeenCalledWith('key')
    expect(catalogKey.save).toHaveBeenCalledWith('key')
  })

  it.each([0, -1, 1.5, '7', null])('rejects malformed catalog ID %j', (catalogId) => {
    expect(() => invoke(IPC.getCatalogGame, 'steam', catalogId)).toThrow(
      'identificador del catálogo'
    )
    expect(steamCatalog.getGame).not.toHaveBeenCalled()
  })
})
