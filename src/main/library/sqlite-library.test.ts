import { describe, expect, it } from 'vitest'
import { ValidationError } from '../../library/validation'
import type { GameInput } from '../../library/model'
import { openDatabase } from './sqlite-database'
import { createLibraryRepository, type LibraryRepository } from './sqlite-library'

function makeRepo(): LibraryRepository {
  return createLibraryRepository(openDatabase(':memory:'))
}

const baseInput: GameInput = { title: 'Hollow Knight', status: 'jugando' }

describe('repositorio de juegos', () => {
  it('crea y lista juegos', () => {
    const repo = makeRepo()
    const created = repo.createGame(baseInput)
    expect(created.id).toBe(1)
    expect(created.title).toBe('Hollow Knight')
    expect(created.status).toBe('jugando')
    expect(created.playtimeMinutes).toBe(0)
    expect(created.rating).toBeNull()
    expect(repo.listGames()).toHaveLength(1)
  })

  it('conserva la ficha enriquecida importada del catálogo', () => {
    const repo = makeRepo()
    const created = repo.createGame({
      ...baseInput,
      source: 'rawg',
      catalogId: 3498,
      description: 'Mundo abierto.',
      coverUrl: 'https://images/cover.jpg',
      backgroundUrl: 'https://images/hero.jpg',
      screenshots: ['https://images/shot.jpg'],
      developers: ['Rockstar North'],
      publishers: ['Rockstar Games'],
      genres: ['Action'],
      platforms: ['PC'],
      metacritic: 92
    })
    expect(created.source).toBe('rawg')
    expect(created.catalogId).toBe(3498)
    expect(created.screenshots).toEqual(['https://images/shot.jpg'])
    expect(created.developers).toEqual(['Rockstar North'])
    expect(created.metacritic).toBe(92)
  })

  it('distingue juegos importados desde Steam', () => {
    const repo = makeRepo()
    const created = repo.createGame({
      ...baseInput,
      source: 'steam',
      catalogId: 400,
      coverUrl: 'https://images/steam-cover.jpg'
    })
    expect(created.source).toBe('steam')
    expect(created.catalogId).toBe(400)
  })

  it('actualiza un juego reemplazando el input completo', () => {
    const repo = makeRepo()
    const created = repo.createGame({ ...baseInput, playtimeMinutes: 120, rating: 9 })
    const updated = repo.updateGame(created.id, {
      ...baseInput,
      status: 'completado',
      showcased: true
    })
    expect(updated.status).toBe('completado')
    expect(updated.rating).toBeNull()
    expect(updated.playtimeMinutes).toBe(0)
    expect(updated.showcased).toBe(true)
    expect(updated.completedAt).not.toBeNull()
  })

  it('fija y limpia completed_at al cambiar de estado', () => {
    const repo = makeRepo()
    const created = repo.createGame(baseInput)
    expect(created.completedAt).toBeNull()
    const done = repo.updateGame(created.id, { ...baseInput, status: 'completado' })
    const firstDate = done.completedAt
    expect(firstDate).not.toBeNull()
    const reopened = repo.updateGame(created.id, { ...baseInput, status: 'pendiente' })
    expect(reopened.completedAt).toBeNull()
  })

  it('borra un juego', () => {
    const repo = makeRepo()
    const created = repo.createGame(baseInput)
    repo.deleteGame(created.id)
    expect(repo.listGames()).toHaveLength(0)
  })

  it('rechaza entrada inválida en trust boundary', () => {
    const repo = makeRepo()
    expect(() => repo.createGame({ ...baseInput, title: '   ' })).toThrow(ValidationError)
    expect(() => repo.createGame({ ...baseInput, rating: 11 })).toThrow(ValidationError)
    expect(() => repo.createGame({ ...baseInput, playtimeMinutes: -5 })).toThrow(ValidationError)
    expect(() => repo.createGame({ ...baseInput, coverUrl: 'file:///secret.jpg' })).toThrow(
      ValidationError
    )
    expect(() => repo.createGame({ ...baseInput, status: 'nada' as never })).toThrow(
      ValidationError
    )
  })

  it('calcula estadísticas agregadas', () => {
    const repo = makeRepo()
    repo.createGame({ ...baseInput, status: 'jugando', playtimeMinutes: 100 })
    repo.createGame({ title: 'Portal', status: 'completado', playtimeMinutes: 20 })
    repo.createGame({ title: 'Half-Life', status: 'completado' })
    repo.createGame({ title: 'Quake', status: 'deseado' })
    const stats = repo.getStats()
    expect(stats.totalGames).toBe(4)
    expect(stats.completed).toBe(2)
    expect(stats.playing).toBe(1)
    expect(stats.totalPlaytimeMinutes).toBe(120)
  })
})

describe('perfil', () => {
  it('devuelve un perfil por defecto y permite actualizarlo', () => {
    const repo = makeRepo()
    expect(repo.getProfile().displayName).toBe('Jugador')
    const updated = repo.updateProfile({
      displayName: 'GamerPro',
      about: 'Coleccionista',
      location: 'Galicia',
      avatarUrl: 'https://images/avatar.jpg',
      backgroundUrl: null
    })
    expect(updated.displayName).toBe('GamerPro')
    expect(repo.getProfile().about).toBe('Coleccionista')
    expect(repo.getProfile().location).toBe('Galicia')
  })

  it('rechaza un nombre vacío', () => {
    const repo = makeRepo()
    expect(() =>
      repo.updateProfile({
        displayName: '',
        about: '',
        location: '',
        avatarUrl: null,
        backgroundUrl: null
      })
    ).toThrow(ValidationError)
  })
})
