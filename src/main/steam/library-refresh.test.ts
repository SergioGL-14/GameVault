import { describe, expect, it, vi, type Mock } from 'vitest'
import type { SteamAccountProvider, SteamWebSession } from '../../steam/model'
import { CatalogError, type GameCatalog } from '../../catalog/model'
import { openDatabase } from '../library/sqlite-database'
import { createLibraryRepository, type LibraryRepository } from '../library/sqlite-library'
import type { SteamKeyStore } from './key-store'
import { createSteamLibraryRefresh, type SteamLibraryRefresh } from './library-refresh'
import { SecureStorageError } from '../secure-key-store'

const profile = { steamId: '76561198000000000', personaName: 'Jugador', avatarUrl: null }
const webProfile = {
  steamId: '76561198000000000',
  personaName: 'Cuenta de Steam',
  avatarUrl: null
}

function setup(): {
  refresh: SteamLibraryRefresh
  repo: LibraryRepository
  keys: SteamKeyStore
  provider: {
    resolveProfile: Mock<SteamAccountProvider['resolveProfile']>
    getLibraryGames: Mock<SteamAccountProvider['getLibraryGames']>
    getAchievements: Mock<SteamAccountProvider['getAchievements']>
  }
  webSession: {
    login: Mock<SteamWebSession['login']>
    restore: Mock<SteamWebSession['restore']>
    getCommunityAchievements: Mock<SteamWebSession['getCommunityAchievements']>
    clear: Mock<SteamWebSession['clear']>
  }
  metadata: {
    search: Mock<GameCatalog['search']>
    getGame: Mock<GameCatalog['getGame']>
  }
} {
  let key: string | null = null
  const keys: SteamKeyStore = {
    get: () => key,
    status: () => ({ configured: key !== null, source: key ? 'saved' : null }),
    save: vi.fn((next: string) => {
      key = next
      return { configured: true, source: 'saved' as const }
    }),
    clear: vi.fn(() => {
      key = null
      return { configured: false, source: null }
    })
  }
  const provider = {
    resolveProfile: vi.fn<SteamAccountProvider['resolveProfile']>(async () => profile),
    getLibraryGames: vi.fn<SteamAccountProvider['getLibraryGames']>(async () => [
      { appId: 400, title: 'Portal' },
      { appId: 620, title: 'Portal 2' }
    ]),
    getAchievements: vi.fn<SteamAccountProvider['getAchievements']>(async () => [])
  }
  const webAuthentication = {
    steamId: profile.steamId,
    credential: { kind: 'web-session' as const, value: 'web-token' }
  }
  const webSession = {
    login: vi.fn<SteamWebSession['login']>(async () => webAuthentication),
    restore: vi.fn<SteamWebSession['restore']>(async () => webAuthentication),
    getCommunityAchievements: vi.fn<SteamWebSession['getCommunityAchievements']>(async () => []),
    clear: vi.fn<SteamWebSession['clear']>(async () => undefined)
  }
  const repo = createLibraryRepository(openDatabase(':memory:'))
  const metadata = {
    search: vi.fn<GameCatalog['search']>(async () => []),
    getGame: vi.fn<GameCatalog['getGame']>(async (appId) => ({
      source: 'steam',
      catalogId: appId,
      title: appId === 400 ? 'Portal' : 'Portal 2',
      description: 'Descripción',
      coverUrl: `gamevault-image://local/123e4567-e89b-42d3-a456-${String(appId).padStart(12, '0')}.jpg`,
      backgroundUrl: null,
      screenshots: [],
      releasedAt: null,
      developers: ['Valve'],
      publishers: ['Valve'],
      genres: ['Puzzle'],
      platforms: ['Windows'],
      website: null,
      metacritic: null
    }))
  }
  return {
    refresh: createSteamLibraryRefresh(repo, keys, provider, webSession, metadata),
    repo,
    keys,
    provider,
    webSession,
    metadata
  }
}

describe('Steam library refresh', () => {
  it('connects without returning the key and requires explicit preview', async () => {
    const { refresh, provider } = setup()
    const result = await refresh.connectWithApiKey('profile', 'secret')

    expect(result).toMatchObject({ ok: true, value: { configured: true, account: profile } })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(provider.getLibraryGames).not.toHaveBeenCalled()
  })

  it('keeps the authoritative snapshot until every ambiguous match is resolved', async () => {
    const { refresh, repo, metadata } = setup()
    const portal = repo.createGame({ title: 'Portal', status: 'jugando' })
    await refresh.connectWithApiKey('profile', 'secret')
    const preview = await refresh.preview()
    if (!preview.ok) throw new Error('preview failed')
    expect(preview.value.items.map((item) => item.kind)).toEqual(['confirmation', 'new'])

    expect((await refresh.apply({ previewId: preview.value.previewId, resolutions: [] })).ok).toBe(
      false
    )
    const applied = await refresh.apply({
      previewId: preview.value.previewId,
      resolutions: [{ appId: 400, gameId: portal.id }]
    })

    expect(applied).toMatchObject({ ok: true, value: { games: expect.any(Array) } })
    expect(metadata.getGame).not.toHaveBeenCalled()
    expect(repo.listGames()).toHaveLength(2)
    expect(repo.listGames().find((game) => game.id === portal.id)?.ownedOn).toEqual(['steam'])
  })

  it('disconnects credentials without removing retained ownership', async () => {
    const { refresh, repo, keys, webSession } = setup()
    await refresh.connectWithApiKey('profile', 'secret')
    const preview = await refresh.preview()
    if (!preview.ok) throw new Error('preview failed')
    await refresh.apply({ previewId: preview.value.previewId, resolutions: [] })

    expect((await refresh.disconnect()).configured).toBe(false)
    expect(keys.clear).toHaveBeenCalled()
    expect(webSession.clear).toHaveBeenCalled()
    expect(repo.listGames().every((game) => game.ownedOn.includes('steam'))).toBe(true)
  })

  it('preserves ownership when a later provider refresh fails', async () => {
    const { refresh, repo, provider } = setup()
    await refresh.connectWithApiKey('profile', 'secret')
    const preview = await refresh.preview()
    if (!preview.ok) throw new Error('preview failed')
    await refresh.apply({ previewId: preview.value.previewId, resolutions: [] })
    provider.getLibraryGames.mockRejectedValueOnce(new Error('offline'))

    await expect(refresh.preview()).resolves.toMatchObject({ ok: false })
    expect(repo.listGames().every((game) => game.ownedOn.includes('steam'))).toBe(true)
  })

  it('invalidates a preview when the canonical library changes', async () => {
    const { refresh, repo } = setup()
    await refresh.connectWithApiKey('profile', 'secret')
    const preview = await refresh.preview()
    if (!preview.ok) throw new Error('preview failed')
    repo.createGame({ title: 'Concurrent game', status: 'pendiente' })

    await expect(
      refresh.apply({ previewId: preview.value.previewId, resolutions: [] })
    ).resolves.toMatchObject({
      ok: false,
      error: { kind: 'stale-preview' }
    })
  })

  it('expires an unchanged preview after fifteen minutes', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-06T10:00:00.000Z'))
      const { refresh } = setup()
      await refresh.connectWithApiKey('profile', 'secret')
      const preview = await refresh.preview()
      if (!preview.ok) throw new Error('preview failed')
      vi.setSystemTime(new Date('2026-09-06T10:15:00.001Z'))

      await expect(
        refresh.apply({ previewId: preview.value.previewId, resolutions: [] })
      ).resolves.toMatchObject({
        ok: false,
        error: { kind: 'stale-preview' }
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports secure-storage refusal without blaming Steam', async () => {
    const { refresh, keys } = setup()
    vi.mocked(keys.save).mockImplementationOnce(() => {
      throw new SecureStorageError()
    })

    await expect(refresh.connectWithApiKey('profile', 'secret')).resolves.toMatchObject({
      ok: false,
      error: { kind: 'secure-storage' }
    })
  })

  it('enriches metadata only through the separate explicit operation', async () => {
    const { refresh, repo, provider, metadata } = setup()
    await refresh.connectWithApiKey('profile', 'secret')
    const preview = await refresh.preview()
    if (!preview.ok) throw new Error('preview failed')
    metadata.getGame.mockRejectedValueOnce(
      new CatalogError({ provider: 'steam', kind: 'provider-response' })
    )
    await refresh.apply({ previewId: preview.value.previewId, resolutions: [] })
    const result = await refresh.refreshMetadata()

    expect(result).toMatchObject({
      ok: true,
      value: { games: expect.any(Array), metadataUpdated: 1, failures: [expect.any(Object)] }
    })
    expect(provider.getAchievements).not.toHaveBeenCalled()
    expect(repo.listGames()).toHaveLength(2)
  })

  it('stops metadata requests after a rate limit and reports remaining games', async () => {
    const { refresh, metadata } = setup()
    await refresh.connectWithApiKey('profile', 'secret')
    const preview = await refresh.preview()
    if (!preview.ok) throw new Error('preview failed')
    await refresh.apply({ previewId: preview.value.previewId, resolutions: [] })
    metadata.getGame.mockRejectedValueOnce(
      new CatalogError({ provider: 'steam', kind: 'rate-limit' })
    )

    const result = await refresh.refreshMetadata()

    expect(result).toMatchObject({
      ok: true,
      value: { metadataUpdated: 0, pending: 1, failures: [{ error: { kind: 'rate-limit' } }] }
    })
    expect(metadata.getGame).toHaveBeenCalledOnce()
  })

  it.each(['offline', 'timeout'] as const)(
    'stops metadata requests after a %s failure',
    async (kind) => {
      const { refresh, metadata } = setup()
      await refresh.connectWithApiKey('profile', 'secret')
      const preview = await refresh.preview()
      if (!preview.ok) throw new Error('preview failed')
      await refresh.apply({ previewId: preview.value.previewId, resolutions: [] })
      metadata.getGame.mockRejectedValueOnce(new CatalogError({ provider: 'steam', kind }))

      await expect(refresh.refreshMetadata()).resolves.toMatchObject({
        ok: true,
        value: { metadataUpdated: 0, pending: 1, failures: [{ error: { kind } }] }
      })
      expect(metadata.getGame).toHaveBeenCalledOnce()
    }
  )

  it('reports per-game metadata progress', async () => {
    const { refresh } = setup()
    await refresh.connectWithApiKey('profile', 'secret')
    const preview = await refresh.preview()
    if (!preview.ok) throw new Error('preview failed')
    await refresh.apply({ previewId: preview.value.previewId, resolutions: [] })
    const progress = vi.fn()

    await refresh.refreshMetadata(progress)

    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'running', processed: 0, total: 2, currentTitle: 'Portal' })
    )
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'completed', processed: 2, total: 2, pending: 0 })
    )
  })

  it('cancels metadata without visiting the next pending game', async () => {
    const { refresh, metadata } = setup()
    await refresh.connectWithApiKey('profile', 'secret')
    const preview = await refresh.preview()
    if (!preview.ok) throw new Error('preview failed')
    await refresh.apply({ previewId: preview.value.previewId, resolutions: [] })
    metadata.getGame.mockImplementationOnce(async () => {
      refresh.cancelMetadata()
      return {
        source: 'steam',
        catalogId: 400,
        title: 'Portal',
        description: 'Descripción',
        coverUrl: 'gamevault-image://local/123e4567-e89b-42d3-a456-426614174000.jpg',
        backgroundUrl: null,
        screenshots: [],
        releasedAt: null,
        developers: [],
        publishers: [],
        genres: [],
        platforms: [],
        website: null,
        metacritic: null
      }
    })

    await expect(refresh.refreshMetadata()).resolves.toMatchObject({
      ok: true,
      value: { cancelled: true, metadataUpdated: 0, pending: 2 }
    })
    expect(metadata.getGame).toHaveBeenCalledOnce()
  })

  it('does not report a local metadata write failure as a Steam failure', async () => {
    const { refresh, repo } = setup()
    await refresh.connectWithApiKey('profile', 'secret')
    const preview = await refresh.preview()
    if (!preview.ok) throw new Error('preview failed')
    await refresh.apply({ previewId: preview.value.previewId, resolutions: [] })
    vi.spyOn(repo, 'applySteamMetadata').mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    const progress = vi.fn()

    await expect(refresh.refreshMetadata(progress)).rejects.toThrow('disk full')
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('cancels and settles metadata before disconnecting the active account', async () => {
    const { refresh, metadata } = setup()
    await refresh.connectWithApiKey('profile', 'secret')
    const preview = await refresh.preview()
    if (!preview.ok) throw new Error('preview failed')
    await refresh.apply({ previewId: preview.value.previewId, resolutions: [] })
    let observedSignal: AbortSignal | undefined
    metadata.getGame.mockImplementationOnce(
      async (_appId, signal) =>
        new Promise((_, reject) => {
          observedSignal = signal
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
    )

    const metadataOperation = refresh.refreshMetadata()
    await vi.waitFor(() => expect(metadata.getGame).toHaveBeenCalledOnce())
    const disconnected = await refresh.disconnect()

    expect(observedSignal?.aborted).toBe(true)
    expect(disconnected.configured).toBe(false)
    await expect(metadataOperation).resolves.toMatchObject({ ok: true, value: { cancelled: true } })
  })

  it('resumes metadata after a rate limit without requesting completed games again', async () => {
    const { refresh, metadata } = setup()
    await refresh.connectWithApiKey('profile', 'secret')
    const preview = await refresh.preview()
    if (!preview.ok) throw new Error('preview failed')
    await refresh.apply({ previewId: preview.value.previewId, resolutions: [] })
    metadata.getGame.mockRejectedValueOnce(
      new CatalogError({ provider: 'steam', kind: 'rate-limit', retryAfterSeconds: 1 })
    )

    await refresh.refreshMetadata()
    await refresh.refreshMetadata()
    metadata.getGame.mockClear()
    await refresh.refreshMetadata()

    expect(metadata.getGame).not.toHaveBeenCalled()
  })

  it('imports achievements only through the separate explicit operation', async () => {
    const { refresh, repo, provider } = setup()
    await refresh.connectWithApiKey('profile', 'secret')
    const preview = await refresh.preview()
    if (!preview.ok) throw new Error('preview failed')
    await refresh.apply({ previewId: preview.value.previewId, resolutions: [] })
    provider.getAchievements.mockResolvedValue([
      {
        providerId: 'PORTAL_COMPLETE',
        name: 'Portal completado',
        description: '',
        iconUrl: null,
        unlocked: true,
        unlockedAt: '2026-09-06'
      }
    ])

    const result = await refresh.refreshAchievements()

    expect(result).toMatchObject({ ok: true, value: { gamesUpdated: 2, failures: [], pending: 0 } })
    expect(provider.getAchievements).toHaveBeenCalledTimes(2)
    expect(repo.listAchievements(repo.listGames()[0].id)).toHaveLength(1)
  })

  it('stops achievement requests after authentication expires', async () => {
    const { refresh, provider } = setup()
    await refresh.connectWithApiKey('profile', 'secret')
    const preview = await refresh.preview()
    if (!preview.ok) throw new Error('preview failed')
    await refresh.apply({ previewId: preview.value.previewId, resolutions: [] })
    provider.getAchievements.mockRejectedValueOnce(
      new CatalogError({ provider: 'steam', kind: 'authentication' })
    )

    const result = await refresh.refreshAchievements()

    expect(result).toMatchObject({
      ok: true,
      value: { gamesUpdated: 0, pending: 1, failures: [{ error: { kind: 'authentication' } }] }
    })
    expect(provider.getAchievements).toHaveBeenCalledOnce()
  })

  it('uses Steam web login by default without saving a user API key', async () => {
    const { refresh, provider, keys, webSession } = setup()

    const result = await refresh.connectWeb()
    expect(result).toMatchObject({
      ok: true,
      value: { credentialSource: 'web-session', account: webProfile }
    })
    expect(JSON.stringify(result)).not.toContain('web-token')
    expect(webSession.login).toHaveBeenCalledOnce()
    expect(provider.resolveProfile).not.toHaveBeenCalled()
    expect(keys.save).not.toHaveBeenCalled()
  })

  it('restores the isolated Steam web session for an explicit refresh', async () => {
    const { refresh, provider, webSession } = setup()
    await refresh.connectWeb()

    await refresh.preview()

    expect(webSession.restore).toHaveBeenCalledOnce()
    expect(provider.getLibraryGames).toHaveBeenCalledWith(profile.steamId, {
      kind: 'web-session',
      value: 'web-token'
    })
  })

  it('rejects a restored browser session for a different Steam account', async () => {
    const { refresh, provider, webSession } = setup()
    await refresh.connectWeb()
    webSession.restore.mockResolvedValueOnce({
      steamId: '76561198000000001',
      credential: { kind: 'web-session', value: 'other-token' }
    })

    await expect(refresh.preview()).resolves.toMatchObject({
      ok: false,
      error: { kind: 'authentication' }
    })
    expect(provider.getLibraryGames).not.toHaveBeenCalled()
  })
})
