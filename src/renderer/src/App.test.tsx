// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameVaultApi } from '../../desktop-api'
import type { Game, GameInput } from '../../library/model'
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

function createApi(initialGames: Game[] = []): GameVaultApi {
  let games = initialGames

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
    }),
    getProfile: vi.fn(async () => profile),
    updateProfile: vi.fn(async (input) => input),
    getStats: vi.fn(async () => ({
      totalGames: games.length,
      completed: 0,
      playing: 0,
      totalPlaytimeMinutes: 0
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
