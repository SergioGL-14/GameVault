import { describe, expect, it } from 'vitest'
import type { Game } from './model'
import { mergeMissingGameMetadata, normalizeGameTitle } from './game-metadata'

const game: Game = {
  id: 1,
  source: 'manual',
  catalogId: null,
  title: 'Portal',
  description: '',
  status: 'jugando',
  playtimeMinutes: 120,
  rating: 9,
  notes: 'Conservar',
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
  showcased: true,
  completedAt: null,
  addedAt: '2026-09-07',
  ownedOn: []
}

describe('game metadata reconciliation', () => {
  it('normalizes only casing and surrounding whitespace for exact title identity', () => {
    expect(normalizeGameTitle('  PÓRTAL  ')).toBe('pórtal')
    expect(normalizeGameTitle('Portal 2')).not.toBe(normalizeGameTitle('Portal II'))
  })

  it('fills missing metadata while preserving personal data', () => {
    expect(
      mergeMissingGameMetadata(game, {
        source: 'steam',
        catalogId: 400,
        title: 'Portal',
        description: 'Descripción',
        status: 'pendiente',
        playtimeMinutes: 0,
        rating: null,
        notes: '',
        coverUrl: 'https://images/portal.jpg',
        developers: ['Valve']
      })
    ).toMatchObject({
      source: 'steam',
      catalogId: 400,
      title: 'Portal',
      description: 'Descripción',
      status: 'jugando',
      playtimeMinutes: 120,
      rating: 9,
      notes: 'Conservar',
      coverUrl: 'https://images/portal.jpg',
      developers: ['Valve'],
      showcased: true
    })
  })

  it('does not replace existing metadata or a custom cover', () => {
    const existing = {
      ...game,
      description: 'Personal',
      coverUrl: 'gamevault-image://local/123e4567-e89b-42d3-a456-426614174000.png',
      genres: ['Puzzle']
    }

    expect(
      mergeMissingGameMetadata(existing, {
        source: 'steam',
        catalogId: 400,
        title: 'Portal',
        description: 'Steam',
        status: 'pendiente',
        coverUrl: 'https://images/steam.jpg',
        genres: ['Acción']
      })
    ).toMatchObject({
      description: 'Personal',
      coverUrl: existing.coverUrl,
      genres: ['Puzzle']
    })
  })
})
