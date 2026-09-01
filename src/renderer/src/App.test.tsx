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
  addedAt: '2026-08-30 20:00:00'
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
      return created
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
        unlockedAt: input.unlockedAt ?? null
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
        unlockedAt: input.unlockedAt ?? null
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
    getCatalogGame: vi.fn()
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

  it('names the profile editor dialog', async () => {
    const api = createApi()
    window.api = api
    render(<App />)
    await waitFor(() => expect(api.listGames).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Modificar perfil' }))

    expect(screen.getByRole('dialog', { name: 'Modificar perfil' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('Nombre'))
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

  it('shows a delete failure inside the edit dialog', async () => {
    const api = createApi([game])
    vi.mocked(api.deleteGame).mockRejectedValueOnce(new Error('No se pudo eliminar el juego'))
    await openEditor(api)

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar de la biblioteca' }))

    expect(await screen.findByText('No se pudo eliminar el juego')).toBeTruthy()
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
          unlockedAt: null
        }
      ]
    )
    window.api = api
    render(<App />)

    expect(await screen.findByText('1 / 1')).toBeTruthy()
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
      unlockedAt: null
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
        unlockedAt: null
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
