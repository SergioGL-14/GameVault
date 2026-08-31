// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    saveCatalogKey: vi.fn(async () => ({ configured: true, source: 'saved' as const })),
    clearCatalogKey: vi.fn(async () => ({ configured: false, source: null })),
    searchCatalog: vi.fn(async () => []),
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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
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
