// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameVaultApi } from '../../desktop-api'
import type { Achievement, AchievementInput, Game, GameInput } from '../../library/model'
import App from './App'

const profile = {
  displayName: 'Jugador',
  about: '',
  location: '',
  avatarUrl: null,
  backgroundUrl: null
}

const game: Game = {
  id: 1,
  source: 'manual',
  catalogId: null,
  title: 'Celeste',
  description: '',
  status: 'pendiente',
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
  addedAt: '2026-08-30 20:00:00',
  ownedOn: []
}

function createApi(
  initialGames: Game[] = [],
  initialAchievements: Achievement[] = []
): GameVaultApi {
  let games = initialGames
  let achievements = initialAchievements

  return {
    listGames: vi.fn(async () => games),
    createGame: vi.fn(async (input: GameInput) => {
      const created = { ...game, ...input, id: games.length + 1 }
      games = [...games, created]
      return { game: created, created: true }
    }),
    updateGame: vi.fn(async (id: number, input: GameInput) => {
      const updated = { ...game, ...games.find((entry) => entry.id === id), ...input, id }
      games = games.map((entry) => (entry.id === id ? updated : entry))
      return updated
    }),
    deleteGame: vi.fn(async (id: number) => {
      games = games.filter((entry) => entry.id !== id)
      achievements = achievements.filter((entry) => entry.gameId !== id)
    }),
    listAchievements: vi.fn(async (gameId: number) =>
      achievements.filter((entry) => entry.gameId === gameId)
    ),
    createAchievement: vi.fn(async (gameId: number, input: AchievementInput) => {
      const created: Achievement = {
        id: Math.max(0, ...achievements.map((entry) => entry.id)) + 1,
        gameId,
        name: input.name,
        description: input.description ?? '',
        iconUrl: input.iconUrl ?? null,
        unlocked: input.unlocked,
        unlockedAt: input.unlockedAt ?? null,
        provider: null,
        providerUnlocked: null,
        manualOverride: null
      }
      achievements = [...achievements, created]
      return created
    }),
    updateAchievement: vi.fn(async (id: number, input: AchievementInput) => {
      const existing = achievements.find((entry) => entry.id === id)
      if (!existing) throw new Error('Logro no encontrado')
      const updated: Achievement = {
        ...existing,
        ...input,
        description: input.description ?? '',
        iconUrl: input.iconUrl ?? null,
        unlockedAt: input.unlockedAt ?? null,
        manualOverride: existing.provider === 'steam' ? input.unlocked : null
      }
      achievements = achievements.map((entry) => (entry.id === id ? updated : entry))
      return updated
    }),
    clearAchievementOverride: vi.fn(async (id: number) => {
      const existing = achievements.find((entry) => entry.id === id)
      if (!existing || existing.provider !== 'steam')
        throw new Error('Logro de Steam no encontrado')
      const updated = {
        ...existing,
        unlocked: existing.providerUnlocked ?? existing.unlocked,
        manualOverride: null
      }
      achievements = achievements.map((entry) => (entry.id === id ? updated : entry))
      return updated
    }),
    deleteAchievement: vi.fn(async (id: number) => {
      achievements = achievements.filter((entry) => entry.id !== id)
    }),
    getProfile: vi.fn(async () => profile),
    updateProfile: vi.fn(async (input) => input),
    getStats: vi.fn(async () => ({
      totalGames: games.length,
      completed: 0,
      playing: 0,
      totalPlaytimeMinutes: 0,
      totalAchievements: achievements.length,
      unlockedAchievements: achievements.filter((entry) => entry.unlocked).length
    })),
    getCatalogStatus: vi.fn(async () => ({ configured: false, source: null })),
    saveCatalogKey: vi.fn(async () => ({
      ok: true as const,
      value: { configured: true, source: 'saved' as const }
    })),
    clearCatalogKey: vi.fn(async () => ({ configured: false, source: null })),
    searchCatalog: vi.fn(async () => ({ ok: true as const, value: [] })),
    getCatalogGame: vi.fn(),
    refreshGameMetadata: vi.fn(async (id: number) => ({
      ok: true as const,
      value: games.find((entry) => entry.id === id) ?? game
    })),
    selectLocalImage: vi.fn(async () => null),
    getSteamConnection: vi.fn(async () => ({
      configured: false,
      credentialSource: null,
      account: null
    })),
    connectSteamWeb: vi.fn(),
    connectSteamApiKey: vi.fn(),
    disconnectSteam: vi.fn(async () => ({
      configured: false,
      credentialSource: null,
      account: null
    })),
    previewSteamRefresh: vi.fn(),
    applySteamRefresh: vi.fn(),
    refreshSteamMetadata: vi.fn(async () => ({
      ok: true as const,
      value: { games, metadataUpdated: 0, failures: [], pending: 0 }
    })),
    refreshSteamAchievements: vi.fn()
  }
}

async function renderLibrary(api: GameVaultApi): Promise<void> {
  window.api = api
  render(<App />)
  await waitFor(() => expect(api.listGames).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'BIBLIOTECA' }))
}

async function openEditor(api: GameVaultApi): Promise<void> {
  await renderLibrary(api)
  fireEvent.click(await screen.findByRole('button', { name: /Celeste/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Editar mi ficha' }))
}

async function openAchievementPage(api: GameVaultApi): Promise<void> {
  await renderLibrary(api)
  fireEvent.click(await screen.findByRole('button', { name: /Celeste/ }))
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Añadir logro' }) as HTMLButtonElement).disabled
    ).toBe(false)
  )
}

async function openAddGameModal(api: GameVaultApi): Promise<void> {
  await renderLibrary(api)
  fireEvent.click(screen.getByRole('button', { name: 'Añadir primer juego' }))
}

async function expectNoAccessibilityViolations(): Promise<void> {
  const result = await axe.run(document.body, {
    // jsdom does not calculate layout or rendered colors.
    rules: { 'color-contrast': { enabled: false } }
  })
  expect(
    result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))
  ).toEqual([])
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  HTMLDialogElement.prototype.showModal = function showModal(): void {
    this.setAttribute('open', '')
    this.querySelector<HTMLElement>('[autofocus]')?.focus()
  }
  HTMLDialogElement.prototype.close = function close(): void {
    this.removeAttribute('open')
  }
})

describe('core accessibility', () => {
  it('exposes navigation, search, filters, and the current view', async () => {
    const api = createApi([game])
    await renderLibrary(api)

    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'BIBLIOTECA' }).getAttribute('aria-current')).toBe(
      'page'
    )
    expect(screen.getByRole('searchbox', { name: 'Buscar en la biblioteca' })).toBeTruthy()
    const filters = screen.getByRole('group', { name: 'Filtrar biblioteca por estado' })
    expect(filters.querySelectorAll('button')).toHaveLength(6)
    const allFilter = screen.getByRole('button', { name: 'Todos' })
    expect(allFilter.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Pendiente' }))
    expect(screen.getByRole('button', { name: 'Pendiente' }).getAttribute('aria-pressed')).toBe(
      'true'
    )
    expect(document.querySelectorAll('main')).toHaveLength(1)
  })

  it('opens a named modal, focuses it, closes on cancel, and restores focus', async () => {
    const api = createApi()
    await renderLibrary(api)
    const opener = screen.getByRole('button', { name: 'Añadir primer juego' })
    opener.focus()
    fireEvent.click(opener)

    const dialog = screen.getByRole('dialog', { name: 'Añadir a la biblioteca' })
    expect(dialog.hasAttribute('open')).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Buscar en Steam' }))
    fireEvent(dialog, new Event('cancel', { cancelable: true }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(opener)
  })

  it('moves focus into a game and restores the originating card', async () => {
    const api = createApi([game])
    await renderLibrary(api)
    const card = await screen.findByRole('button', { name: /Celeste/ })
    card.focus()
    fireEvent.click(card)

    const heading = await screen.findByRole('heading', { name: 'Celeste', level: 1 })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    fireEvent.click(screen.getByRole('button', { name: '← Biblioteca' }))

    const restoredCard = await screen.findByRole('button', { name: /Celeste/ })
    await waitFor(() => expect(document.activeElement).toBe(restoredCard))
  })

  it('shows the libraries where a game is owned in its information panel', async () => {
    const api = createApi([{ ...game, ownedOn: ['steam'] }])
    await renderLibrary(api)
    fireEvent.click(await screen.findByRole('button', { name: /Celeste/ }))

    expect(screen.getByText('En mi biblioteca').nextElementSibling?.textContent).toBe('Steam')
  })

  it('moves profile editing into the Settings destination', async () => {
    const api = createApi()
    window.api = api
    render(<App />)
    await waitFor(() => expect(api.listGames).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Modificar perfil' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuración' }))

    expect(await screen.findByRole('heading', { name: 'Configuración' })).toBeTruthy()
    expect(screen.getByLabelText('Nombre del perfil')).toBeTruthy()
  })

  it('uses the local profile and a compact settings action for primary navigation', async () => {
    const api = createApi()
    window.api = api
    render(<App />)
    await waitFor(() => expect(api.getProfile).toHaveBeenCalled())

    expect(screen.getByRole('button', { name: 'Ir al perfil' }).textContent).toContain(
      profile.displayName
    )
    expect(screen.queryByText('GAMEVAULT')).toBeNull()
    expect(screen.queryByRole('button', { name: 'PERFIL' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Abrir configuración' })).toBeTruthy()
  })

  it('updates Settings when the persisted profile finishes loading', async () => {
    const api = createApi()
    let resolveProfile: ((value: typeof profile) => void) | undefined
    vi.mocked(api.getProfile).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProfile = resolve
        })
    )
    window.api = api
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuración' }))
    expect(screen.queryByLabelText('Nombre del perfil')).toBeNull()
    expect(screen.getByText('Cargando configuración...')).toBeTruthy()

    await act(async () => resolveProfile?.({ ...profile, displayName: 'Perfil persistido' }))

    await waitFor(() =>
      expect((screen.getByLabelText('Nombre del perfil') as HTMLInputElement).value).toBe(
        'Perfil persistido'
      )
    )
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Configuración' }))
  })

  it('announces asynchronous form failures as alerts', async () => {
    const api = createApi()
    vi.mocked(api.createGame).mockRejectedValueOnce(new Error('No se pudo crear el juego'))
    await openAddGameModal(api)
    fireEvent.click(screen.getByRole('button', { name: 'Entrada manual' }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Hades' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear ficha' }))

    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo crear el juego')
  })

  it('passes automated checks in representative profile, library, detail, and modal states', async () => {
    const api = createApi([game])
    window.api = api
    render(<App />)
    await waitFor(() => expect(api.listGames).toHaveBeenCalled())
    await expectNoAccessibilityViolations()

    fireEvent.click(screen.getByRole('button', { name: 'BIBLIOTECA' }))
    await expectNoAccessibilityViolations()

    fireEvent.click(await screen.findByRole('button', { name: /Celeste/ }))
    await expectNoAccessibilityViolations()

    fireEvent.click(screen.getByRole('button', { name: 'Editar mi ficha' }))
    await expectNoAccessibilityViolations()
  })
})

describe('critical library flows', () => {
  it('updates and reports an existing game instead of duplicating it', async () => {
    const api = createApi([game])
    vi.mocked(api.createGame).mockResolvedValueOnce({
      game: { ...game, description: 'Descripción añadida' },
      created: false
    })
    await renderLibrary(api)
    fireEvent.click(screen.getByRole('button', { name: 'Añadir juego' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrada manual' }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Celeste' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear ficha' }))

    expect(await screen.findByText(/ya estaba en tu biblioteca/)).toBeTruthy()
    expect(api.createGame).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '← Biblioteca' }))
    expect(screen.getAllByRole('button', { name: /Celeste/ })).toHaveLength(1)
  })

  it('refreshes catalog metadata from the edit modal', async () => {
    const providerGame = { ...game, source: 'steam' as const, catalogId: 400 }
    const api = createApi([providerGame])
    vi.mocked(api.refreshGameMetadata).mockResolvedValueOnce({
      ok: true,
      value: {
        ...providerGame,
        description: 'Descripción de Steam',
        coverUrl: 'https://images/portal.jpg'
      }
    })
    await openEditor(api)

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar metadatos' }))

    expect(await screen.findByText('Metadatos actualizados.')).toBeTruthy()
    expect(api.refreshGameMetadata).toHaveBeenCalledWith(providerGame.id)
    expect((screen.getByLabelText('URL de carátula') as HTMLInputElement).value).toBe(
      'https://images/portal.jpg'
    )
  })

  it('preserves metadata completed in the background when the editor saves', async () => {
    const providerGame = { ...game, source: 'steam' as const, catalogId: 400 }
    const enriched = { ...providerGame, description: 'Descripción de Steam' }
    let completeRefresh!: (value: Awaited<ReturnType<GameVaultApi['refreshSteamMetadata']>>) => void
    const api = createApi([providerGame])
    vi.mocked(api.getSteamConnection).mockResolvedValue({
      configured: true,
      credentialSource: 'web-session',
      account: {
        steamId: '76561198000000000',
        personaName: 'Jugador Steam',
        avatarUrl: null,
        lastRefreshedAt: '2026-09-07T10:00:00.000Z'
      }
    })
    vi.mocked(api.refreshSteamMetadata).mockReturnValue(
      new Promise((resolve) => {
        completeRefresh = resolve
      })
    )
    await openEditor(api)
    fireEvent.change(screen.getByLabelText('Notas personales'), {
      target: { value: 'Mi nota' }
    })

    await waitFor(() => expect(api.refreshSteamMetadata).toHaveBeenCalled())
    await act(async () => {
      completeRefresh({
        ok: true,
        value: { games: [enriched], metadataUpdated: 1, failures: [], pending: 0 }
      })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(api.updateGame).toHaveBeenCalledWith(
        providerGame.id,
        expect.objectContaining({ description: 'Descripción de Steam', notes: 'Mi nota' })
      )
    )
  })

  it('does not offer catalog refresh for a manual game', async () => {
    const api = createApi([game])
    await openEditor(api)

    expect(screen.queryByRole('button', { name: 'Actualizar metadatos' })).toBeNull()
  })

  it('connects Steam through its web login without refreshing automatically', async () => {
    const api = createApi()
    vi.mocked(api.connectSteamWeb).mockResolvedValueOnce({
      ok: true,
      value: {
        configured: true,
        credentialSource: 'web-session',
        account: {
          steamId: '76561198000000000',
          personaName: 'Jugador Steam',
          avatarUrl: null,
          lastRefreshedAt: null
        }
      }
    })
    window.api = api
    render(<App />)
    await waitFor(() => expect(api.listGames).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuración' }))
    expect(api.previewSteamRefresh).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión con Steam' }))

    await screen.findByRole('button', { name: 'Refrescar ahora' })
    expect(api.connectSteamWeb).toHaveBeenCalledWith()
    expect(api.previewSteamRefresh).not.toHaveBeenCalled()
  })

  it('keeps the personal API key as an advanced Steam fallback', async () => {
    const api = createApi()
    vi.mocked(api.connectSteamApiKey).mockResolvedValueOnce({
      ok: true,
      value: {
        configured: true,
        credentialSource: 'api-key',
        account: {
          steamId: '76561198000000000',
          personaName: 'Jugador Steam',
          avatarUrl: null,
          lastRefreshedAt: null
        }
      }
    })
    window.api = api
    render(<App />)
    await waitFor(() => expect(api.listGames).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuración' }))
    fireEvent.click(screen.getByText('Usar API key (avanzado)'))

    const keyInput = screen.getByLabelText('Web API key') as HTMLInputElement
    expect(keyInput.type).toBe('password')
    fireEvent.change(screen.getByLabelText('SteamID64 o URL del perfil'), {
      target: { value: '76561198000000000' }
    })
    fireEvent.change(keyInput, { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conectar con API key' }))

    await screen.findByRole('button', { name: 'Refrescar ahora' })
    expect(api.connectSteamApiKey).toHaveBeenCalledWith('76561198000000000', 'secret')
    expect(screen.queryByLabelText('Web API key')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Desconectar Steam' }))
    await waitFor(() =>
      expect((screen.getByLabelText('Web API key') as HTMLInputElement).value).toBe('')
    )
    expect(api.previewSteamRefresh).not.toHaveBeenCalled()
  })

  it('requires ambiguous Steam games to be resolved before applying a refresh', async () => {
    const api = createApi([game])
    vi.mocked(api.getSteamConnection).mockResolvedValue({
      configured: true,
      credentialSource: 'web-session',
      account: {
        steamId: '76561198000000000',
        personaName: 'Jugador Steam',
        avatarUrl: null,
        lastRefreshedAt: null
      }
    })
    vi.mocked(api.previewSteamRefresh).mockResolvedValueOnce({
      ok: true,
      value: {
        previewId: 'preview',
        items: [
          {
            kind: 'confirmation',
            game: { appId: 400, title: 'Celeste' },
            candidates: [{ gameId: game.id, title: game.title }]
          }
        ]
      }
    })
    vi.mocked(api.applySteamRefresh).mockResolvedValueOnce({
      ok: true,
      value: {
        games: [{ ...game, ownedOn: ['steam'] }]
      }
    })
    vi.mocked(api.refreshSteamMetadata).mockResolvedValueOnce({
      ok: true,
      value: {
        games: [{ ...game, ownedOn: ['steam'] }],
        metadataUpdated: 1,
        failures: [],
        pending: 0
      }
    })
    window.api = api
    render(<App />)
    await waitFor(() => expect(api.listGames).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuración' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Refrescar ahora' }))

    const apply = await screen.findByRole('button', { name: 'Aplicar refresco' })
    expect(apply.hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByLabelText('Asociar Celeste con'), {
      target: { value: String(game.id) }
    })
    expect(apply.hasAttribute('disabled')).toBe(false)
    fireEvent.click(apply)

    await waitFor(() =>
      expect(api.applySteamRefresh).toHaveBeenCalledWith({
        previewId: 'preview',
        resolutions: [{ appId: 400, gameId: game.id }]
      })
    )
    expect(api.refreshSteamMetadata).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'BIBLIOTECA' }))
    expect((await screen.findByRole('button', { name: /Celeste/ })).textContent).toContain('steam')
  })

  it('resumes pending Steam metadata after startup', async () => {
    const api = createApi([game])
    vi.mocked(api.getSteamConnection).mockResolvedValue({
      configured: true,
      credentialSource: 'web-session',
      account: {
        steamId: '76561198000000000',
        personaName: 'Jugador Steam',
        avatarUrl: null,
        lastRefreshedAt: '2026-09-06T10:00:00.000Z'
      }
    })

    window.api = api
    render(<App />)

    await waitFor(() => expect(api.refreshSteamMetadata).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuración' }))
    expect(await screen.findByText(/Todos los metadatos están al día/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desconectar Steam' }))
    await waitFor(() => expect(screen.queryByText(/Todos los metadatos están al día/)).toBeNull())
  })

  it('retries pending Steam metadata after the provider rate limit', async () => {
    vi.useFakeTimers()
    try {
      const api = createApi([game])
      vi.mocked(api.getSteamConnection).mockResolvedValue({
        configured: true,
        credentialSource: 'web-session',
        account: {
          steamId: '76561198000000000',
          personaName: 'Jugador Steam',
          avatarUrl: null,
          lastRefreshedAt: '2026-09-06T10:00:00.000Z'
        }
      })
      vi.mocked(api.refreshSteamMetadata)
        .mockResolvedValueOnce({
          ok: true,
          value: {
            games: [game],
            metadataUpdated: 0,
            failures: [
              {
                appId: 400,
                title: 'Portal',
                error: { provider: 'steam', kind: 'rate-limit', retryAfterSeconds: 1 }
              }
            ],
            pending: 0
          }
        })
        .mockResolvedValueOnce({
          ok: true,
          value: { games: [game], metadataUpdated: 1, failures: [], pending: 0 }
        })
      vi.mocked(api.previewSteamRefresh).mockResolvedValueOnce({
        ok: true,
        value: { previewId: 'empty', items: [] }
      })
      vi.mocked(api.applySteamRefresh).mockResolvedValueOnce({
        ok: true,
        value: { games: [{ ...game, ownedOn: ['steam'] }] }
      })

      window.api = api
      render(<App />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(api.refreshSteamMetadata).toHaveBeenCalledOnce()

      fireEvent.click(screen.getByRole('button', { name: 'Abrir configuración' }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      fireEvent.click(screen.getByRole('button', { name: 'Refrescar ahora' }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar refresco' }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(api.refreshSteamMetadata).toHaveBeenCalledOnce()
      fireEvent.click(screen.getByRole('button', { name: 'BIBLIOTECA' }))
      expect(screen.getByRole('button', { name: /Celeste/ }).textContent).toContain('steam')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      expect(api.refreshSteamMetadata).toHaveBeenCalledTimes(2)
      fireEvent.click(screen.getByRole('button', { name: 'Abrir configuración' }))
      expect(screen.getByText(/Todos los metadatos están al día/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a queued metadata pass behind the provider rate-limit delay', async () => {
    const api = createApi([game])
    let resolveMetadata:
      ((value: Awaited<ReturnType<GameVaultApi['refreshSteamMetadata']>>) => void) | undefined
    vi.mocked(api.getSteamConnection).mockResolvedValue({
      configured: true,
      credentialSource: 'web-session',
      account: {
        steamId: '76561198000000000',
        personaName: 'Jugador Steam',
        avatarUrl: null,
        lastRefreshedAt: '2026-09-06T10:00:00.000Z'
      }
    })
    vi.mocked(api.refreshSteamMetadata)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveMetadata = resolve
          })
      )
      .mockResolvedValueOnce({
        ok: true,
        value: { games: [game], metadataUpdated: 1, failures: [], pending: 0 }
      })
    vi.mocked(api.previewSteamRefresh).mockResolvedValueOnce({
      ok: true,
      value: { previewId: 'empty', items: [] }
    })
    vi.mocked(api.applySteamRefresh).mockResolvedValueOnce({
      ok: true,
      value: { games: [{ ...game, ownedOn: ['steam'] }] }
    })

    window.api = api
    render(<App />)
    await waitFor(() => expect(api.refreshSteamMetadata).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuración' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Refrescar ahora' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar refresco' }))
    await screen.findByText(/Completando metadatos/)

    vi.useFakeTimers()
    try {
      await act(async () => {
        resolveMetadata?.({
          ok: true,
          value: {
            games: [game],
            metadataUpdated: 0,
            failures: [
              {
                appId: 400,
                title: 'Portal',
                error: { provider: 'steam', kind: 'rate-limit', retryAfterSeconds: 1 }
              }
            ],
            pending: 0
          }
        })
      })
      await vi.advanceTimersByTimeAsync(999)
      expect(api.refreshSteamMetadata).toHaveBeenCalledOnce()

      await vi.advanceTimersByTimeAsync(1)
      expect(api.refreshSteamMetadata).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('imports Steam achievements through a separate explicit action', async () => {
    const api = createApi([game])
    vi.mocked(api.getSteamConnection).mockResolvedValue({
      configured: true,
      credentialSource: 'web-session',
      account: {
        steamId: '76561198000000000',
        personaName: 'Jugador Steam',
        avatarUrl: null,
        lastRefreshedAt: '2026-09-06T10:00:00.000Z'
      }
    })
    vi.mocked(api.refreshSteamAchievements).mockResolvedValue({
      ok: true,
      value: { gamesUpdated: 1, failures: [], pending: 0 }
    })
    window.api = api
    render(<App />)
    await waitFor(() => expect(api.listGames).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuración' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Importar logros' }))

    expect(await screen.findByText('1 juego con logros revisados.')).toBeTruthy()
    expect(api.refreshSteamAchievements).toHaveBeenCalledOnce()
    await waitFor(() => expect(api.getStats).toHaveBeenCalledTimes(2))
    expect(api.previewSteamRefresh).not.toHaveBeenCalled()
  })

  it('warns before applying an explicitly empty Steam snapshot', async () => {
    const api = createApi()
    vi.mocked(api.getSteamConnection).mockResolvedValue({
      configured: true,
      credentialSource: 'web-session',
      account: {
        steamId: '76561198000000000',
        personaName: 'Jugador Steam',
        avatarUrl: null,
        lastRefreshedAt: '2026-09-06T10:00:00.000Z'
      }
    })
    vi.mocked(api.previewSteamRefresh).mockResolvedValueOnce({
      ok: true,
      value: { previewId: 'empty', items: [] }
    })
    window.api = api
    render(<App />)
    await waitFor(() => expect(api.listGames).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuración' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Refrescar ahora' }))

    expect((await screen.findByRole('alert')).textContent).toContain('biblioteca vacía')
    expect(screen.getByRole('button', { name: 'Aplicar refresco' }).hasAttribute('disabled')).toBe(
      false
    )
  })

  it('submits a locally selected cover for a manual game', async () => {
    const api = createApi()
    vi.mocked(api.selectLocalImage).mockResolvedValueOnce(
      'gamevault-image://local/123e4567-e89b-42d3-a456-426614174000.webp'
    )
    await openAddGameModal(api)
    fireEvent.click(screen.getByRole('button', { name: 'Entrada manual' }))

    fireEvent.click(screen.getByRole('button', { name: 'Elegir archivo para la carátula' }))
    await waitFor(() =>
      expect((screen.getByLabelText('URL de carátula (opcional)') as HTMLInputElement).value).toBe(
        'gamevault-image://local/123e4567-e89b-42d3-a456-426614174000.webp'
      )
    )
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Hades' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear ficha' }))

    await waitFor(() =>
      expect(api.createGame).toHaveBeenCalledWith(
        expect.objectContaining({
          coverUrl: 'gamevault-image://local/123e4567-e89b-42d3-a456-426614174000.webp'
        })
      )
    )
  })

  it('keeps an existing cover when local image selection is cancelled', async () => {
    const api = createApi([{ ...game, coverUrl: 'https://example.com/celeste.jpg' }])
    await openEditor(api)

    fireEvent.click(screen.getByRole('button', { name: 'Elegir archivo para la carátula' }))

    await waitFor(() => expect(api.selectLocalImage).toHaveBeenCalled())
    expect((screen.getByLabelText('URL de carátula') as HTMLInputElement).value).toBe(
      'https://example.com/celeste.jpg'
    )
  })

  it('removes an existing game cover', async () => {
    const api = createApi([{ ...game, coverUrl: 'https://example.com/celeste.jpg' }])
    await openEditor(api)

    fireEvent.click(screen.getByRole('button', { name: 'Quitar carátula' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(api.updateGame).toHaveBeenCalledWith(
        game.id,
        expect.objectContaining({ coverUrl: null })
      )
    )
  })

  it('shows local image picker failures in the current form', async () => {
    const api = createApi()
    vi.mocked(api.selectLocalImage).mockRejectedValueOnce(
      new Error('La imagen es demasiado grande')
    )
    window.api = api
    render(<App />)
    await waitFor(() => expect(api.listGames).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuración' }))

    fireEvent.click(screen.getByRole('button', { name: 'Elegir archivo para el avatar' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'La imagen es demasiado grande'
    )
  })

  it('saves locally selected profile avatar and background images', async () => {
    const avatar = 'gamevault-image://local/123e4567-e89b-42d3-a456-426614174000.png'
    const background = 'gamevault-image://local/223e4567-e89b-42d3-a456-426614174000.webp'
    const api = createApi()
    vi.mocked(api.selectLocalImage).mockResolvedValueOnce(avatar).mockResolvedValueOnce(background)
    window.api = api
    render(<App />)
    await waitFor(() => expect(api.listGames).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuración' }))

    fireEvent.click(screen.getByRole('button', { name: 'Elegir archivo para el avatar' }))
    await waitFor(() =>
      expect((screen.getByLabelText('URL del avatar') as HTMLInputElement).value).toBe(avatar)
    )
    fireEvent.click(screen.getByRole('button', { name: 'Elegir archivo para el fondo' }))
    await waitFor(() =>
      expect((screen.getByLabelText('URL del fondo') as HTMLInputElement).value).toBe(background)
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }))

    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ avatarUrl: avatar, backgroundUrl: background })
      )
    )
  })

  it('adds a manual game', async () => {
    const api = createApi()
    await renderLibrary(api)

    fireEvent.click(screen.getByRole('button', { name: 'Añadir primer juego' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrada manual' }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Hades' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear ficha' }))

    expect(await screen.findByRole('heading', { name: 'Hades' })).toBeTruthy()
    expect(api.createGame).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Hades', source: 'manual' })
    )
  })

  it('keeps a created game visible when the library refresh fails', async () => {
    const api = createApi()
    await openAddGameModal(api)
    fireEvent.click(screen.getByRole('button', { name: 'Entrada manual' }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Hades' } })
    vi.mocked(api.listGames).mockRejectedValueOnce(new Error('No se pudo actualizar la biblioteca'))
    fireEvent.click(screen.getByRole('button', { name: 'Crear ficha' }))

    expect(await screen.findByRole('heading', { name: 'Hades' })).toBeTruthy()
    expect(await screen.findByText('No se pudo actualizar la biblioteca')).toBeTruthy()
  })

  it('shows a create failure inside the add dialog', async () => {
    const api = createApi()
    vi.mocked(api.createGame).mockRejectedValueOnce(new Error('No se pudo crear el juego'))
    await renderLibrary(api)

    fireEvent.click(screen.getByRole('button', { name: 'Añadir primer juego' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrada manual' }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Hades' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear ficha' }))

    expect(await screen.findByText('No se pudo crear el juego')).toBeTruthy()
  })

  it('edits a game', async () => {
    const api = createApi([game])
    await openEditor(api)

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Celeste Updated' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('heading', { name: 'Celeste Updated' })).toBeTruthy()
    expect(api.updateGame).toHaveBeenCalledWith(
      game.id,
      expect.objectContaining({ title: 'Celeste Updated' })
    )
  })

  it('keeps an updated game visible when the library refresh fails', async () => {
    const api = createApi([game])
    await openEditor(api)
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Celeste Updated' } })
    vi.mocked(api.listGames).mockRejectedValueOnce(new Error('No se pudo actualizar la biblioteca'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('heading', { name: 'Celeste Updated' })).toBeTruthy()
    expect(await screen.findByText('No se pudo actualizar la biblioteca')).toBeTruthy()
  })

  it('shows an update failure inside the edit dialog', async () => {
    const api = createApi([game])
    vi.mocked(api.updateGame).mockRejectedValueOnce(new Error('No se pudo guardar el juego'))
    await openEditor(api)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('No se pudo guardar el juego')).toBeTruthy()
  })

  it('deletes a game after confirmation', async () => {
    const api = createApi([game])
    await openEditor(api)

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar de la biblioteca' }))

    expect(await screen.findByRole('heading', { name: 'Empieza tu colección' })).toBeTruthy()
    expect(api.deleteGame).toHaveBeenCalledWith(game.id)
  })

  it('keeps a deleted game hidden when the library refresh fails', async () => {
    const api = createApi([game])
    await openEditor(api)
    vi.mocked(api.listGames).mockRejectedValueOnce(new Error('No se pudo actualizar la biblioteca'))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar de la biblioteca' }))

    expect(await screen.findByRole('heading', { name: 'Empieza tu colección' })).toBeTruthy()
    expect(await screen.findByText('No se pudo actualizar la biblioteca')).toBeTruthy()
  })

  it('keeps a showcase change visible when the library refresh fails', async () => {
    const api = createApi([game])
    await renderLibrary(api)
    fireEvent.click(await screen.findByRole('button', { name: /Celeste/ }))
    vi.mocked(api.listGames).mockRejectedValueOnce(new Error('No se pudo actualizar la biblioteca'))
    fireEvent.click(screen.getByRole('button', { name: '★ Destacar' }))

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '★ En el expositor' }).getAttribute('aria-pressed')
      ).toBe('true')
    )
    expect(await screen.findByText('No se pudo actualizar la biblioteca')).toBeTruthy()
  })

  it('shows a delete failure inside the edit dialog', async () => {
    const api = createApi([game])
    vi.mocked(api.deleteGame).mockRejectedValueOnce(new Error('No se pudo eliminar el juego'))
    await openEditor(api)

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar de la biblioteca' }))

    expect(await screen.findByText('No se pudo eliminar el juego')).toBeTruthy()
  })
})

describe('profile showcase', () => {
  it('shows avatar and cover fallbacks when images cannot load', async () => {
    const api = createApi([
      {
        ...game,
        coverUrl: 'gamevault-image://local/123e4567-e89b-42d3-a456-426614174000.webp'
      }
    ])
    vi.mocked(api.getProfile).mockResolvedValueOnce({
      ...profile,
      avatarUrl: 'gamevault-image://local/223e4567-e89b-42d3-a456-426614174000.webp'
    })
    window.api = api
    render(<App />)

    const avatar = await screen.findByAltText('Avatar de Jugador')
    fireEvent.error(avatar)
    expect(screen.queryByAltText('Avatar de Jugador')).toBeNull()
    expect(document.querySelector('.profile-avatar')?.textContent).toBe('JU')

    const cover = document.querySelector<HTMLImageElement>('.summary-covers img')
    expect(cover).toBeTruthy()
    fireEvent.error(cover!)
    expect(document.querySelector('.summary-covers img')).toBeNull()
    expect(document.querySelector('.summary-covers button')?.textContent).toBe('C')
  })

  it('displays every showcased game', async () => {
    const games = Array.from({ length: 7 }, (_, index) => ({
      ...game,
      id: index + 1,
      title: `Showcase ${index + 1}`,
      showcased: true
    }))
    const api = createApi(games)
    window.api = api
    render(<App />)

    expect(await screen.findByText('7 seleccionados')).toBeTruthy()
    expect(screen.getByText('Showcase 7')).toBeTruthy()
  })
})

describe('catalog recovery flows', () => {
  it('retries a failed search without reopening the modal', async () => {
    const api = createApi()
    vi.mocked(api.searchCatalog)
      .mockResolvedValueOnce({
        ok: false,
        error: { provider: 'steam', kind: 'offline' }
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            source: 'steam',
            catalogId: 400,
            title: 'Portal',
            coverUrl: null,
            releasedAt: null,
            platforms: ['Windows'],
            metacritic: 90
          }
        ]
      })
    await openAddGameModal(api)
    fireEvent.change(screen.getByPlaceholderText(/Busca primero en Steam/), {
      target: { value: 'Portal' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText(/No se pudo conectar con Steam/)).toBeTruthy()
    expect(screen.getByText('Tu biblioteca local sigue disponible.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar búsqueda' }))

    expect(await screen.findByRole('button', { name: /Portal/ })).toBeTruthy()
    expect(api.searchCatalog).toHaveBeenCalledTimes(2)
    expect(api.searchCatalog).toHaveBeenLastCalledWith('steam', 'Portal')
  })

  it('keeps manual creation available after an offline catalog failure', async () => {
    const api = createApi()
    vi.mocked(api.searchCatalog).mockResolvedValueOnce({
      ok: false,
      error: { provider: 'steam', kind: 'offline' }
    })
    await openAddGameModal(api)
    fireEvent.change(screen.getByPlaceholderText(/Busca primero en Steam/), {
      target: { value: 'Hades' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await screen.findByText(/No se pudo conectar con Steam/)

    fireEvent.click(screen.getByRole('button', { name: 'Entrada manual' }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Hades' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear ficha' }))

    expect(await screen.findByRole('heading', { name: 'Hades' })).toBeTruthy()
    expect(api.createGame).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hades' }))
  })

  it('offers replacing or removing a rejected RAWG key', async () => {
    const api = createApi()
    vi.mocked(api.getCatalogStatus).mockResolvedValueOnce({ configured: true, source: 'saved' })
    vi.mocked(api.searchCatalog).mockResolvedValueOnce({
      ok: false,
      error: { provider: 'rawg', kind: 'authentication' }
    })
    await openAddGameModal(api)
    fireEvent.click(screen.getByRole('button', { name: /RAWG/ }))
    const searchbox = await screen.findByPlaceholderText(/Busca juegos fuera de Steam/)
    fireEvent.change(searchbox, { target: { value: 'Portal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText(/RAWG rechazó la clave/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sustituir clave' }))
    fireEvent.change(screen.getByLabelText('Clave API de RAWG'), {
      target: { value: 'replacement-key' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y conectar' }))
    await waitFor(() => expect(api.saveCatalogKey).toHaveBeenCalledWith('replacement-key'))
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar clave' }))

    await waitFor(() => expect(api.clearCatalogKey).toHaveBeenCalled())
  })

  it('directs rejected environment credentials to RAWG_API_KEY', async () => {
    const api = createApi()
    vi.mocked(api.getCatalogStatus).mockResolvedValueOnce({
      configured: true,
      source: 'environment'
    })
    vi.mocked(api.searchCatalog).mockResolvedValueOnce({
      ok: false,
      error: { provider: 'rawg', kind: 'authentication' }
    })
    await openAddGameModal(api)
    fireEvent.click(screen.getByRole('button', { name: /RAWG/ }))
    fireEvent.change(await screen.findByPlaceholderText(/Busca juegos fuera de Steam/), {
      target: { value: 'Portal' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText(/Actualiza o elimina esa variable de entorno/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sustituir clave' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Eliminar clave' })).toBeNull()
  })

  it('prevents navigation while a catalog request is active', async () => {
    const api = createApi()
    let finishSearch: ((result: { ok: true; value: [] }) => void) | undefined
    vi.mocked(api.searchCatalog).mockReturnValueOnce(
      new Promise((resolve) => {
        finishSearch = resolve
      })
    )
    await openAddGameModal(api)
    fireEvent.change(screen.getByPlaceholderText(/Busca primero en Steam/), {
      target: { value: 'Portal' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    expect((screen.getByRole('button', { name: /RAWG/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Entrada manual' }) as HTMLButtonElement).disabled
    ).toBe(true)
    expect((screen.getByRole('button', { name: 'Cerrar' }) as HTMLButtonElement).disabled).toBe(
      true
    )

    await act(async () => finishSearch?.({ ok: true, value: [] }))
  })

  it('announces an import without describing it as a search', async () => {
    const api = createApi()
    vi.mocked(api.searchCatalog).mockResolvedValueOnce({
      ok: true,
      value: [
        {
          source: 'steam',
          catalogId: 400,
          title: 'Portal',
          coverUrl: null,
          releasedAt: null,
          platforms: ['Windows'],
          metacritic: 90
        }
      ]
    })
    vi.mocked(api.getCatalogGame).mockReturnValueOnce(new Promise(() => undefined))
    await openAddGameModal(api)
    fireEvent.change(screen.getByPlaceholderText(/Busca primero en Steam/), {
      target: { value: 'Portal' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    fireEvent.click(await screen.findByRole('button', { name: /Portal/ }))

    expect(screen.getByText('Importando juego').getAttribute('role')).toBe('status')
  })
})

describe('achievement flows', () => {
  it('creates, edits, unlocks, relocks, and deletes an achievement from the game page', async () => {
    const api = createApi([game])
    await openAchievementPage(api)

    fireEvent.click(screen.getByRole('button', { name: 'Añadir logro' }))
    fireEvent.change(screen.getByLabelText('Nombre del logro'), {
      target: { value: 'Corazón de cristal' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear logro' }))
    expect(await screen.findByText('0 / 1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear Corazón de cristal' }))
    expect(await screen.findByText('1 / 1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Editar Corazón de cristal' }))
    fireEvent.change(screen.getByLabelText('Nombre del logro'), {
      target: { value: 'Corazón completo' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar logro' }))
    expect(await screen.findByText('Corazón completo')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Volver a bloquear Corazón completo' }))
    expect(await screen.findByText('0 / 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Corazón completo' }))
    expect(await screen.findByText('Añade logros propios para registrar tu progreso.')).toBeTruthy()

    expect(api.createAchievement).toHaveBeenCalledWith(
      game.id,
      expect.objectContaining({ name: 'Corazón de cristal', unlocked: false })
    )
    expect(api.deleteAchievement).toHaveBeenCalled()
  })

  it('shows aggregate achievement totals on the profile', async () => {
    const api = createApi(
      [game],
      [
        {
          id: 1,
          gameId: game.id,
          name: 'Corazón de cristal',
          description: '',
          iconUrl: null,
          unlocked: true,
          unlockedAt: null,
          provider: null,
          providerUnlocked: null,
          manualOverride: null
        }
      ]
    )
    window.api = api
    render(<App />)

    expect(await screen.findByText('1 / 1')).toBeTruthy()
  })

  it('returns a manually adjusted achievement to its Steam state', async () => {
    const imported: Achievement = {
      id: 1,
      gameId: game.id,
      name: 'Corazón de cristal',
      description: '',
      iconUrl: null,
      unlocked: true,
      unlockedAt: null,
      provider: 'steam',
      providerUnlocked: false,
      manualOverride: true
    }
    const api = createApi([game], [imported])
    await renderLibrary(api)
    fireEvent.click(await screen.findByRole('button', { name: /Celeste/ }))

    fireEvent.click(await screen.findByRole('button', { name: 'Usar estado de Steam' }))

    await waitFor(() => expect(api.clearAchievementOverride).toHaveBeenCalledWith(imported.id))
    expect(await screen.findByText('Bloqueado')).toBeTruthy()
    expect(screen.queryByText('Estado ajustado manualmente')).toBeNull()
  })

  it('does not apply an in-flight achievement update after opening another game', async () => {
    const portal = { ...game, id: 2, title: 'Portal' }
    const achievement: Achievement = {
      id: 1,
      gameId: game.id,
      name: 'Corazón de cristal',
      description: '',
      iconUrl: null,
      unlocked: false,
      unlockedAt: null,
      provider: null,
      providerUnlocked: null,
      manualOverride: null
    }
    const portalAchievement: Achievement = {
      ...achievement,
      id: 2,
      gameId: portal.id,
      name: 'Sujeto de pruebas'
    }
    const api = createApi([game, portal], [achievement])
    let resolveUpdate: (value: Achievement) => void = () => undefined
    let resolvePortalList: (value: Achievement[]) => void = () => undefined
    vi.mocked(api.updateAchievement).mockImplementationOnce(
      () => new Promise((resolve) => (resolveUpdate = resolve))
    )
    vi.mocked(api.listAchievements).mockImplementation((gameId) =>
      gameId === portal.id
        ? new Promise((resolve) => (resolvePortalList = resolve))
        : Promise.resolve([achievement])
    )
    await renderLibrary(api)
    fireEvent.click(await screen.findByRole('button', { name: /Celeste/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Desbloquear Corazón de cristal' }))
    fireEvent.click(screen.getByRole('button', { name: '← Biblioteca' }))
    fireEvent.click(screen.getByRole('button', { name: /Portal/ }))

    resolveUpdate({ ...achievement, unlocked: true })
    resolvePortalList([portalAchievement])

    await waitFor(() => expect(api.getStats).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Corazón de cristal')).toBeNull()
    expect(await screen.findByText('Sujeto de pruebas')).toBeTruthy()
    expect(screen.getByText('0 / 1')).toBeTruthy()
  })

  it('waits for stored achievements before enabling creation', async () => {
    const api = createApi([game])
    let resolveList: (value: Achievement[]) => void = () => undefined
    vi.mocked(api.listAchievements).mockImplementationOnce(
      () => new Promise<Achievement[]>((resolve) => (resolveList = resolve))
    )
    await renderLibrary(api)
    fireEvent.click(await screen.findByRole('button', { name: /Celeste/ }))
    expect(
      (screen.getByRole('button', { name: 'Añadir logro' }) as HTMLButtonElement).disabled
    ).toBe(true)
    expect(screen.getByText('Cargando logros…')).toBeTruthy()

    resolveList([
      {
        id: 1,
        gameId: game.id,
        name: 'Existente',
        description: '',
        iconUrl: null,
        unlocked: false,
        unlockedAt: null,
        provider: null,
        providerUnlocked: null,
        manualOverride: null
      }
    ])

    expect(await screen.findByText('Existente')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Añadir logro' }) as HTMLButtonElement).disabled
    ).toBe(false)
    expect(screen.getByText('0 / 1')).toBeTruthy()
  })

  it('keeps creation disabled when stored achievements cannot load', async () => {
    const api = createApi([game])
    vi.mocked(api.listAchievements).mockRejectedValueOnce(new Error('No se pudieron cargar'))
    await renderLibrary(api)
    fireEvent.click(await screen.findByRole('button', { name: /Celeste/ }))

    expect(
      await screen.findByText(
        'No se pudieron cargar los logros. Vuelve a abrir la ficha para reintentar.'
      )
    ).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Añadir logro' }) as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('shows an achievement save failure inside the dialog', async () => {
    const api = createApi([game])
    vi.mocked(api.createAchievement).mockRejectedValueOnce(new Error('No se pudo guardar el logro'))
    await openAchievementPage(api)
    fireEvent.click(screen.getByRole('button', { name: 'Añadir logro' }))
    fireEvent.change(screen.getByLabelText('Nombre del logro'), { target: { value: 'Logro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear logro' }))

    expect(await screen.findByText('No se pudo guardar el logro')).toBeTruthy()
  })

  it('does not report a successful write as failed when statistics cannot refresh', async () => {
    const api = createApi([game])
    await openAchievementPage(api)
    fireEvent.click(screen.getByRole('button', { name: 'Añadir logro' }))
    fireEvent.change(screen.getByLabelText('Nombre del logro'), { target: { value: 'Guardado' } })
    vi.mocked(api.getStats).mockRejectedValueOnce(
      new Error('No se pudieron actualizar los totales')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Crear logro' }))

    expect(await screen.findByText('Guardado')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Nuevo logro' })).toBeNull()
    expect(await screen.findByText('No se pudieron actualizar los totales')).toBeTruthy()
    expect(api.createAchievement).toHaveBeenCalledTimes(1)
  })
})
