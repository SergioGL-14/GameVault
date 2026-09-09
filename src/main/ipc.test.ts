import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogError, type AuthenticatedGameCatalog, type GameCatalog } from '../catalog/model'
import { IPC } from '../desktop-api'
import { ManagedImageError } from './images/managed-images'
import type { LibraryRepository } from './library/sqlite-library'
import type { CatalogKeyStore } from './catalog/rawg-key-store'
import type { SteamLibraryRefresh } from './steam/library-refresh'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const electron = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  handle: vi.fn((channel: string, handler: Handler) => {
    electron.handlers.set(channel, handler)
  })
}))

vi.mock('electron', () => ({ ipcMain: { handle: electron.handle } }))

import { registerIpc } from './ipc'

const game = {
  id: 7,
  source: 'steam' as const,
  catalogId: 400,
  title: 'Portal',
  description: '',
  status: 'pendiente' as const,
  playtimeMinutes: 0,
  rating: null,
  notes: '',
  coverUrl: null,
  backgroundUrl: null,
  screenshots: [],
  releasedAt: null,
  developers: [],
  publishers: [],
  genres: [],
  platforms: [],
  website: null,
  metacritic: null,
  showcased: false,
  completedAt: null,
  addedAt: '2026-09-07',
  ownedOn: []
}

function method<T extends (...args: never[]) => unknown>(): ReturnType<typeof vi.fn<T>> {
  return vi.fn<T>()
}

const repo: LibraryRepository = {
  listGames: method<LibraryRepository['listGames']>(),
  addGame: method<LibraryRepository['addGame']>(),
  getGame: method<LibraryRepository['getGame']>(),
  createGame: method<LibraryRepository['createGame']>(),
  updateGame: method<LibraryRepository['updateGame']>(),
  deleteGame: method<LibraryRepository['deleteGame']>(),
  listAchievements: method<LibraryRepository['listAchievements']>(),
  createAchievement: method<LibraryRepository['createAchievement']>(),
  updateAchievement: method<LibraryRepository['updateAchievement']>(),
  clearAchievementOverride: method<LibraryRepository['clearAchievementOverride']>(),
  deleteAchievement: method<LibraryRepository['deleteAchievement']>(),
  getProfile: method<LibraryRepository['getProfile']>(),
  updateProfile: method<LibraryRepository['updateProfile']>(),
  getStats: method<LibraryRepository['getStats']>(),
  getSteamAccount: method<LibraryRepository['getSteamAccount']>(),
  connectSteamAccount: method<LibraryRepository['connectSteamAccount']>(),
  disconnectSteamAccount: method<LibraryRepository['disconnectSteamAccount']>(),
  applySteamOwnershipSnapshot: method<LibraryRepository['applySteamOwnershipSnapshot']>(),
  listSteamOwnerships: method<LibraryRepository['listSteamOwnerships']>(),
  listPendingSteamMetadata: method<LibraryRepository['listPendingSteamMetadata']>(),
  applyCatalogMetadata: method<LibraryRepository['applyCatalogMetadata']>(),
  applySteamMetadata: method<LibraryRepository['applySteamMetadata']>(),
  applySteamAchievementSnapshot: method<LibraryRepository['applySteamAchievementSnapshot']>()
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

const selectLocalImage = vi.fn<() => Promise<string | null>>()
const steamLibrary: SteamLibraryRefresh = {
  status: method<SteamLibraryRefresh['status']>(),
  connectWeb: method<SteamLibraryRefresh['connectWeb']>(),
  connectWithApiKey: method<SteamLibraryRefresh['connectWithApiKey']>(),
  disconnect: method<SteamLibraryRefresh['disconnect']>(),
  preview: method<SteamLibraryRefresh['preview']>(),
  apply: method<SteamLibraryRefresh['apply']>(),
  refreshMetadata: method<SteamLibraryRefresh['refreshMetadata']>(),
  cancelMetadata: method<SteamLibraryRefresh['cancelMetadata']>(),
  refreshAchievements: method<SteamLibraryRefresh['refreshAchievements']>()
}

function invoke(channel: string, ...args: unknown[]): unknown {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
  return handler({}, ...args)
}

beforeEach(() => {
  vi.clearAllMocks()
  electron.handlers.clear()
  registerIpc(repo, steamCatalog, rawgCatalog, catalogKey, selectLocalImage, steamLibrary)
})

describe('IPC registration', () => {
  it('registers every desktop API channel', () => {
    expect([...electron.handlers.keys()]).toEqual(
      Object.values(IPC).filter((channel) => channel !== IPC.steamMetadataProgress)
    )
  })

  it('forwards valid library calls', () => {
    const input = { title: 'Celeste', status: 'pendiente' } as const

    invoke(IPC.createGame, input)
    invoke(IPC.updateGame, 7, input)
    invoke(IPC.deleteGame, 7)

    expect(repo.addGame).toHaveBeenCalledWith(input)
    expect(repo.updateGame).toHaveBeenCalledWith(7, input)
    expect(repo.deleteGame).toHaveBeenCalledWith(7)
  })

  it('forwards valid achievement calls', () => {
    const input = { name: 'Primer paso', unlocked: false } as const

    invoke(IPC.listAchievements, 7)
    invoke(IPC.createAchievement, 7, input)
    invoke(IPC.updateAchievement, 9, input)
    invoke(IPC.clearAchievementOverride, 9)
    invoke(IPC.deleteAchievement, 9)

    expect(repo.listAchievements).toHaveBeenCalledWith(7)
    expect(repo.createAchievement).toHaveBeenCalledWith(7, input)
    expect(repo.updateAchievement).toHaveBeenCalledWith(9, input)
    expect(repo.clearAchievementOverride).toHaveBeenCalledWith(9)
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
    await invoke(IPC.searchCatalog, 'steam', 'Celeste')
    await invoke(IPC.getCatalogGame, 'rawg', 7)
    await invoke(IPC.saveCatalogKey, 'key')

    expect(repo.updateProfile).toHaveBeenCalledWith(profile)
    expect(steamCatalog.search).toHaveBeenCalledWith('Celeste')
    expect(rawgCatalog.getGame).toHaveBeenCalledWith(7)
    expect(rawgCatalog.verifyKey).toHaveBeenCalledWith('key')
    expect(catalogKey.save).toHaveBeenCalledWith('key')
  })

  it('refreshes one game through its persisted catalog identity', async () => {
    vi.mocked(repo.getGame).mockReturnValue(game)
    vi.mocked(steamCatalog.getGame).mockResolvedValue({
      source: 'steam',
      catalogId: 400,
      title: 'Portal',
      description: 'Descripción',
      coverUrl: null,
      backgroundUrl: null,
      screenshots: [],
      releasedAt: null,
      developers: [],
      publishers: [],
      genres: [],
      platforms: [],
      website: null,
      metacritic: null
    })
    vi.mocked(repo.applyCatalogMetadata).mockReturnValue({ ...game, description: 'Descripción' })

    await expect(invoke(IPC.refreshGameMetadata, game.id)).resolves.toMatchObject({
      ok: true,
      value: { id: game.id, description: 'Descripción' }
    })
    expect(steamCatalog.getGame).toHaveBeenCalledWith(400)
    expect(repo.applyCatalogMetadata).toHaveBeenCalledWith(
      game.id,
      expect.objectContaining({ source: 'steam', catalogId: 400 })
    )
  })

  it('does not disguise metadata persistence failures as catalog failures', async () => {
    vi.mocked(repo.getGame).mockReturnValue(game)
    vi.mocked(steamCatalog.getGame).mockResolvedValue({
      source: 'steam',
      catalogId: 400,
      title: 'Portal',
      description: '',
      coverUrl: null,
      backgroundUrl: null,
      screenshots: [],
      releasedAt: null,
      developers: [],
      publishers: [],
      genres: [],
      platforms: [],
      website: null,
      metacritic: null
    })
    vi.mocked(repo.applyCatalogMetadata).mockImplementation(() => {
      throw new Error('SQLite write failed')
    })

    await expect(invoke(IPC.refreshGameMetadata, game.id)).rejects.toThrow('SQLite write failed')
  })

  it('does not disguise managed-image persistence failures as catalog failures', async () => {
    vi.mocked(repo.getGame).mockReturnValue(game)
    vi.mocked(steamCatalog.getGame).mockRejectedValue(
      new ManagedImageError('Image write failed', 'persistence')
    )

    await expect(invoke(IPC.refreshGameMetadata, game.id)).rejects.toThrow('Image write failed')
  })

  it('forwards local image selection without renderer-supplied paths', async () => {
    selectLocalImage.mockResolvedValueOnce('gamevault-image://local/image.png')

    await invoke(IPC.selectLocalImage)

    expect(selectLocalImage).toHaveBeenCalledWith()
  })

  it('forwards narrow Steam connection and refresh operations', async () => {
    invoke(IPC.steamConnection)
    await invoke(IPC.connectSteamWeb)
    await invoke(IPC.connectSteamApiKey, 'profile', 'key')
    await invoke(IPC.previewSteamRefresh)
    await invoke(IPC.refreshSteamMetadata)
    await invoke(IPC.cancelSteamMetadata)
    await invoke(IPC.refreshSteamAchievements)
    invoke(IPC.applySteamRefresh, { previewId: 'preview', resolutions: [] })
    invoke(IPC.disconnectSteam)

    expect(steamLibrary.status).toHaveBeenCalledWith()
    expect(steamLibrary.connectWeb).toHaveBeenCalledWith()
    expect(steamLibrary.connectWithApiKey).toHaveBeenCalledWith('profile', 'key')
    expect(steamLibrary.preview).toHaveBeenCalledWith()
    expect(steamLibrary.refreshMetadata).toHaveBeenCalledWith(expect.any(Function))
    expect(steamLibrary.cancelMetadata).toHaveBeenCalledWith()
    expect(steamLibrary.refreshAchievements).toHaveBeenCalledWith()
    expect(steamLibrary.apply).toHaveBeenCalledWith({ previewId: 'preview', resolutions: [] })
    expect(steamLibrary.disconnect).toHaveBeenCalledWith()
  })

  it('forwards Steam metadata progress only to the requesting renderer', async () => {
    const send = vi.fn()
    const progress = {
      status: 'running' as const,
      currentTitle: 'Portal',
      processed: 0,
      total: 1,
      metadataUpdated: 0,
      failed: 0,
      pending: 1
    }
    vi.mocked(steamLibrary.refreshMetadata).mockImplementationOnce(async (onProgress) => {
      onProgress?.(progress)
      return {
        ok: true,
        value: { games: [], metadataUpdated: 0, failures: [], pending: 1 }
      }
    })
    const handler = electron.handlers.get(IPC.refreshSteamMetadata)
    if (!handler) throw new Error('Missing metadata handler')

    await handler({ sender: { send } })

    expect(send).toHaveBeenCalledWith(IPC.steamMetadataProgress, progress)
  })
})

describe('IPC validation', () => {
  it('rejects malformed Steam connection and duplicate resolutions', () => {
    expect(() => invoke(IPC.connectSteamApiKey, '', 'key')).toThrow('conexión de Steam')
    expect(() =>
      invoke(IPC.applySteamRefresh, {
        previewId: 'preview',
        resolutions: [
          { appId: 400, gameId: null },
          { appId: 400, gameId: 2 }
        ]
      })
    ).toThrow('duplicada')
    expect(steamLibrary.connectWithApiKey).not.toHaveBeenCalled()
    expect(steamLibrary.apply).not.toHaveBeenCalled()
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '7', null])(
    'rejects malformed library ID %j',
    (id) => {
      expect(() => invoke(IPC.deleteGame, id)).toThrow('identificador del juego')
      expect(repo.deleteGame).not.toHaveBeenCalled()
    }
  )

  it('rejects malformed game input', () => {
    expect(() => invoke(IPC.createGame, null)).toThrow('juego')
    expect(() => invoke(IPC.updateGame, 7, { title: 3, status: 'pendiente' })).toThrow('juego')
    expect(() =>
      invoke(IPC.createGame, { title: 'Celeste', status: 'pendiente', playtimeMinutes: null })
    ).toThrow('tiempo jugado')
    expect(repo.createGame).not.toHaveBeenCalled()
    expect(repo.updateGame).not.toHaveBeenCalled()
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '9', null])(
    'rejects malformed achievement ID %j',
    (id) => {
      expect(() => invoke(IPC.deleteAchievement, id)).toThrow('identificador del logro')
      expect(repo.deleteAchievement).not.toHaveBeenCalled()
    }
  )

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

  it('returns neutral failures for malformed catalog searches and keys', async () => {
    await expect(invoke(IPC.searchCatalog, 'steam', ' ')).resolves.toEqual({
      ok: false,
      error: { provider: 'steam', kind: 'invalid-input' }
    })
    await expect(invoke(IPC.saveCatalogKey, null)).resolves.toEqual({
      ok: false,
      error: { provider: 'rawg', kind: 'invalid-input' }
    })
    expect(steamCatalog.search).not.toHaveBeenCalled()
    expect(rawgCatalog.verifyKey).not.toHaveBeenCalled()
  })

  it('enforces the providers catalog query limit', async () => {
    const maxQuery = 'a'.repeat(100)

    await expect(invoke(IPC.searchCatalog, 'steam', maxQuery)).resolves.toEqual({
      ok: true,
      value: undefined
    })
    await expect(invoke(IPC.searchCatalog, 'steam', `${maxQuery}a`)).resolves.toEqual({
      ok: false,
      error: { provider: 'steam', kind: 'invalid-input' }
    })
    expect(steamCatalog.search).toHaveBeenCalledOnce()
    expect(steamCatalog.search).toHaveBeenCalledWith(maxQuery)
  })

  it('serializes adapter failures without provider implementation details', async () => {
    vi.mocked(steamCatalog.search).mockRejectedValueOnce(
      new CatalogError({ provider: 'steam', kind: 'timeout' })
    )

    await expect(invoke(IPC.searchCatalog, 'steam', 'Celeste')).resolves.toEqual({
      ok: false,
      error: { provider: 'steam', kind: 'timeout' }
    })
  })

  it('normalizes a catalog key before verifying and saving it', async () => {
    await invoke(IPC.saveCatalogKey, '  key  ')

    expect(rawgCatalog.verifyKey).toHaveBeenCalledWith('key')
    expect(catalogKey.save).toHaveBeenCalledWith('key')
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '7', null])(
    'returns a failure for malformed catalog ID %j',
    async (catalogId) => {
      await expect(invoke(IPC.getCatalogGame, 'steam', catalogId)).resolves.toEqual({
        ok: false,
        error: { provider: 'steam', kind: 'invalid-input' }
      })
      expect(steamCatalog.getGame).not.toHaveBeenCalled()
    }
  )
})
