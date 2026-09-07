import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CatalogGameDetail } from '../../catalog/model'
import { ValidationError } from '../../library/validation'
import type { GameInput } from '../../library/model'
import { openDatabase } from './sqlite-database'
import { createLibraryRepository, type LibraryRepository } from './sqlite-library'

function makeRepo(): LibraryRepository {
  return createLibraryRepository(openDatabase(':memory:'))
}

const baseInput: GameInput = { title: 'Hollow Knight', status: 'jugando' }

describe('repositorio de juegos', () => {
  it('reconciles an existing manual title instead of creating a duplicate', () => {
    const repo = makeRepo()
    const first = repo.addGame({ title: 'Portal', status: 'jugando', notes: 'Conservar' })

    const repeated = repo.addGame({
      title: '  PORTAL ',
      description: 'Descripción añadida',
      status: 'pendiente',
      coverUrl: 'https://images/portal.jpg'
    })

    expect(first.created).toBe(true)
    expect(repeated).toMatchObject({
      created: false,
      game: {
        id: first.game.id,
        description: 'Descripción añadida',
        coverUrl: 'https://images/portal.jpg',
        status: 'jugando',
        notes: 'Conservar'
      }
    })
    expect(repo.listGames()).toHaveLength(1)
  })

  it('keeps distinct catalog identities that share a title', () => {
    const repo = makeRepo()
    const first = repo.addGame({
      source: 'steam',
      catalogId: 400,
      title: 'Portal',
      status: 'pendiente'
    })
    const second = repo.addGame({
      source: 'steam',
      catalogId: 620,
      title: 'Portal',
      status: 'pendiente'
    })

    expect(first.created).toBe(true)
    expect(second.created).toBe(true)
    expect(second.game.id).not.toBe(first.game.id)
    expect(repo.listGames()).toHaveLength(2)
  })

  it('reconciles exact catalog identity and adopts it for a matching manual game', () => {
    const repo = makeRepo()
    const manual = repo.addGame({ title: 'Portal', status: 'pendiente' })

    const imported = repo.addGame({
      source: 'steam',
      catalogId: 400,
      title: 'Portal',
      description: 'Descripción de Steam',
      status: 'pendiente'
    })
    const repeated = repo.addGame({
      source: 'steam',
      catalogId: 400,
      title: 'Portal renamed',
      status: 'pendiente'
    })

    expect(imported).toMatchObject({
      created: false,
      game: { id: manual.game.id, source: 'steam', catalogId: 400 }
    })
    expect(repeated).toMatchObject({ created: false, game: { id: manual.game.id } })
    expect(repo.listGames()).toHaveLength(1)
  })

  it('applies catalog metadata to an existing game without replacing personal data', () => {
    const repo = makeRepo()
    const created = repo.addGame({
      source: 'steam',
      catalogId: 400,
      title: 'Portal',
      status: 'jugando',
      notes: 'Conservar'
    }).game

    const detail: CatalogGameDetail = {
      source: 'steam',
      catalogId: 400,
      title: 'Portal',
      description: 'Descripción',
      coverUrl: 'https://images/portal.jpg',
      backgroundUrl: null,
      screenshots: [],
      releasedAt: null,
      developers: ['Valve'],
      publishers: [],
      genres: [],
      platforms: [],
      website: null,
      metacritic: null
    }
    const updated = repo.applyCatalogMetadata(created.id, detail)

    expect(updated).toMatchObject({
      id: created.id,
      description: 'Descripción',
      coverUrl: 'https://images/portal.jpg',
      status: 'jugando',
      notes: 'Conservar'
    })
    expect(() => repo.applyCatalogMetadata(created.id, { ...detail, catalogId: 620 })).toThrow(
      'identidad'
    )
  })

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

  it.each([
    ['screenshots', 'private malformed payload'],
    ['developers', '["Team Cherry", 42]']
  ])('rejects corrupt persisted JSON in %s without exposing its value', (field, value) => {
    const db = openDatabase(':memory:')
    const repo = createLibraryRepository(db)
    const game = repo.createGame(baseInput)
    db.prepare(`UPDATE games SET ${field} = ? WHERE id = ?`).run(value, game.id)

    try {
      repo.listGames()
      throw new Error('Expected corrupt JSON to be rejected')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe(
        `Datos dañados en el juego ${game.id}: el campo "${field}" no es una lista válida`
      )
      expect((error as Error).message).not.toContain(value)
    } finally {
      db.close()
    }
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
    expect(stats.totalAchievements).toBe(0)
    expect(stats.unlockedAchievements).toBe(0)
  })
})

describe('logros', () => {
  it('persiste los logros al reabrir la base de datos', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gamevault-achievements-'))
    const file = join(directory, 'library.db')
    try {
      const firstDatabase = openDatabase(file)
      const firstRepo = createLibraryRepository(firstDatabase)
      const gameEntry = firstRepo.createGame(baseInput)
      firstRepo.createAchievement(gameEntry.id, {
        name: 'Persistente',
        unlocked: true,
        unlockedAt: '2026-08-31'
      })
      firstDatabase.close()

      const reopenedDatabase = openDatabase(file)
      const reopenedRepo = createLibraryRepository(reopenedDatabase)
      expect(reopenedRepo.listAchievements(gameEntry.id)).toMatchObject([
        { name: 'Persistente', unlocked: true, unlockedAt: '2026-08-31' }
      ])
      reopenedDatabase.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('crea, lista y separa logros por juego', () => {
    const repo = makeRepo()
    const celeste = repo.createGame(baseInput)
    const portal = repo.createGame({ title: 'Portal', status: 'pendiente' })

    const created = repo.createAchievement(celeste.id, {
      name: '  Primer paso  ',
      description: 'Completa el prólogo.',
      iconUrl: 'https://images.example/first.png',
      unlocked: false
    })
    repo.createAchievement(portal.id, { name: 'Despertar', unlocked: false })

    expect(created).toMatchObject({
      gameId: celeste.id,
      name: 'Primer paso',
      description: 'Completa el prólogo.',
      unlocked: false,
      unlockedAt: null
    })
    expect(repo.listAchievements(celeste.id)).toEqual([created])
  })

  it('edita, desbloquea y vuelve a bloquear un logro', () => {
    const repo = makeRepo()
    const gameEntry = repo.createGame(baseInput)
    const achievement = repo.createAchievement(gameEntry.id, {
      name: 'Primer paso',
      unlocked: false
    })

    const unlocked = repo.updateAchievement(achievement.id, {
      name: 'Primer salto',
      unlocked: true,
      unlockedAt: '2026-08-31'
    })
    expect(unlocked).toMatchObject({
      name: 'Primer salto',
      unlocked: true,
      unlockedAt: '2026-08-31'
    })

    const relocked = repo.updateAchievement(achievement.id, {
      name: 'Primer salto',
      unlocked: false
    })
    expect(relocked.unlocked).toBe(false)
    expect(relocked.unlockedAt).toBeNull()
  })

  it('borra logros directamente y en cascada con su juego', () => {
    const repo = makeRepo()
    const firstGame = repo.createGame(baseInput)
    const first = repo.createAchievement(firstGame.id, { name: 'Primero', unlocked: false })
    repo.deleteAchievement(first.id)
    expect(repo.listAchievements(firstGame.id)).toEqual([])

    const second = repo.createAchievement(firstGame.id, { name: 'Segundo', unlocked: false })
    repo.deleteGame(firstGame.id)
    expect(repo.listAchievements(firstGame.id)).toEqual([])
    expect(() => repo.updateAchievement(second.id, { name: 'Segundo', unlocked: true })).toThrow(
      'no encontrado'
    )
  })

  it('rechaza propietarios, identificadores y datos inválidos', () => {
    const repo = makeRepo()
    const gameEntry = repo.createGame(baseInput)
    expect(() => repo.createAchievement(999, { name: 'Logro', unlocked: false })).toThrow(
      'Juego 999 no encontrado'
    )
    expect(() => repo.updateAchievement(999, { name: 'Logro', unlocked: false })).toThrow(
      'Logro 999 no encontrado'
    )
    expect(() => repo.createAchievement(gameEntry.id, { name: '', unlocked: false })).toThrow(
      ValidationError
    )
  })

  it('calcula totales globales desde SQLite', () => {
    const repo = makeRepo()
    const firstGame = repo.createGame(baseInput)
    const secondGame = repo.createGame({ title: 'Portal', status: 'completado' })
    repo.createAchievement(firstGame.id, { name: 'Uno', unlocked: true })
    repo.createAchievement(firstGame.id, { name: 'Dos', unlocked: false })
    repo.createAchievement(secondGame.id, { name: 'Tres', unlocked: true })

    expect(repo.getStats()).toMatchObject({ totalAchievements: 3, unlockedAchievements: 2 })
  })
})

describe('propiedad externa', () => {
  const steamProfile = {
    steamId: '76561198000000000',
    personaName: 'Jugador Steam',
    avatarUrl: null
  }

  it('aplica una instantánea completa sin duplicar juegos ni sobrescribir datos personales', () => {
    const repo = makeRepo()
    const existing = repo.createGame({
      title: 'Portal',
      status: 'jugando',
      notes: 'Conservar'
    })
    repo.connectSteamAccount(steamProfile)

    repo.applySteamOwnershipSnapshot(
      [
        { appId: 400, title: 'Portal' },
        { appId: 620, title: 'Portal 2' }
      ],
      [
        { appId: 400, gameId: existing.id },
        { appId: 620, gameId: null }
      ],
      '2026-09-06T10:00:00.000Z'
    )
    const portal2 = repo.listGames().find((game) => game.title === 'Portal 2')
    if (!portal2) throw new Error('Portal 2 was not imported')
    const repeated = repo.applySteamOwnershipSnapshot(
      [
        { appId: 400, title: 'Portal' },
        { appId: 620, title: 'Portal 2' }
      ],
      [
        { appId: 400, gameId: existing.id },
        { appId: 620, gameId: portal2.id }
      ],
      '2026-09-06T11:00:00.000Z'
    )

    expect(repeated).toHaveLength(2)
    expect(repeated.find((game) => game.id === existing.id)).toMatchObject({
      status: 'jugando',
      notes: 'Conservar',
      ownedOn: ['steam']
    })
    expect(repo.getSteamAccount()?.lastRefreshedAt).toBe('2026-09-06T11:00:00.000Z')
  })

  it('retains ownership history on disconnect and deactivates absence only on a later snapshot', () => {
    const repo = makeRepo()
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Portal' }],
      [{ appId: 400, gameId: null }]
    )

    repo.disconnectSteamAccount()
    expect(repo.getSteamAccount()).toBeNull()
    expect(repo.listGames()[0].ownedOn).toEqual(['steam'])

    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot([], [])
    expect(repo.listGames()[0].ownedOn).toEqual([])
  })

  it('rejects an incomplete resolution before changing ownership', () => {
    const repo = makeRepo()
    repo.connectSteamAccount(steamProfile)
    expect(() => repo.applySteamOwnershipSnapshot([{ appId: 400, title: 'Portal' }], [])).toThrow(
      'no está completa'
    )
    expect(repo.listGames()).toEqual([])
  })

  it('rejects two Steam AppIDs mapped to one canonical game', () => {
    const repo = makeRepo()
    const portal = repo.createGame({ title: 'Portal', status: 'pendiente' })
    repo.connectSteamAccount(steamProfile)

    expect(() =>
      repo.applySteamOwnershipSnapshot(
        [
          { appId: 400, title: 'Portal' },
          { appId: 401, title: 'Portal test' }
        ],
        [
          { appId: 400, gameId: portal.id },
          { appId: 401, gameId: portal.id }
        ]
      )
    ).toThrow('misma ficha')
    expect(repo.listSteamOwnerships()).toEqual([])
  })

  it('lists only active Steam ownerships', () => {
    const repo = makeRepo()
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Portal' }],
      [{ appId: 400, gameId: null }]
    )
    repo.applySteamOwnershipSnapshot([], [])

    expect(repo.listSteamOwnerships()).toEqual([])
    expect(repo.listPendingSteamMetadata()).toEqual([
      { appId: 400, gameId: repo.listGames()[0].id }
    ])
  })

  it('lists only Steam games whose metadata has not completed', () => {
    const repo = makeRepo()
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [
        { appId: 400, title: 'Portal' },
        { appId: 620, title: 'Portal 2' }
      ],
      [
        { appId: 400, gameId: null },
        { appId: 620, gameId: null }
      ]
    )

    repo.applySteamMetadata(400, {
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

    expect(repo.listPendingSteamMetadata()).toEqual([
      { appId: 620, gameId: repo.listGames().find((game) => game.catalogId === 620)?.id }
    ])
  })

  it('keeps completed metadata complete when the same ownership snapshot is reapplied', () => {
    const repo = makeRepo()
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Portal' }],
      [{ appId: 400, gameId: null }]
    )
    const portal = repo.listGames()[0]
    repo.applySteamMetadata(400, {
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

    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Portal' }],
      [{ appId: 400, gameId: portal.id }]
    )

    expect(repo.listPendingSteamMetadata()).toEqual([])
  })

  it('requeues metadata when an AppID is remapped to another canonical game', () => {
    const repo = makeRepo()
    const first = repo.createGame({ title: 'Portal', status: 'pendiente' })
    const second = repo.createGame({ title: 'Portal remasterizado', status: 'pendiente' })
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Portal' }],
      [{ appId: 400, gameId: first.id }]
    )
    repo.applySteamMetadata(400, {
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

    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Portal' }],
      [{ appId: 400, gameId: second.id }]
    )

    expect(repo.listPendingSteamMetadata()).toEqual([{ appId: 400, gameId: second.id }])
  })

  it('keeps metadata pending when its game update fails', () => {
    const repo = makeRepo()
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Steam App 400' }],
      [{ appId: 400, gameId: null }]
    )

    expect(() =>
      repo.applySteamMetadata(400, {
        source: 'steam',
        catalogId: 400,
        title: '',
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
    ).toThrow()
    expect(repo.listPendingSteamMetadata()).toHaveLength(1)
  })

  it('rejects remapping a canonical game to a different historical Steam AppID', () => {
    const repo = makeRepo()
    const portal = repo.createGame({ title: 'Portal', status: 'pendiente' })
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Portal' }],
      [{ appId: 400, gameId: portal.id }]
    )

    expect(() =>
      repo.applySteamOwnershipSnapshot(
        [{ appId: 401, title: 'Portal test' }],
        [{ appId: 401, gameId: portal.id }]
      )
    ).toThrow('misma ficha')
    expect(repo.listSteamOwnerships()).toEqual([{ appId: 400, gameId: portal.id }])
  })

  it('rolls back deactivation and writes when a later resolution fails', () => {
    const repo = makeRepo()
    const portal = repo.createGame({ title: 'Portal', status: 'jugando' })
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Portal' }],
      [{ appId: 400, gameId: portal.id }],
      '2026-09-06T10:00:00.000Z'
    )

    expect(() =>
      repo.applySteamOwnershipSnapshot(
        [
          { appId: 400, title: 'Changed provider title' },
          { appId: 620, title: 'Portal 2' }
        ],
        [
          { appId: 400, gameId: portal.id },
          { appId: 620, gameId: 999 }
        ],
        '2026-09-06T11:00:00.000Z'
      )
    ).toThrow('Juego 999')

    expect(repo.listGames()).toHaveLength(1)
    expect(repo.listGames()[0].ownedOn).toEqual(['steam'])
    expect(repo.getSteamAccount()?.lastRefreshedAt).toBe('2026-09-06T10:00:00.000Z')
  })

  it('enriches imported games while preserving personal progress', () => {
    const repo = makeRepo()
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Portal' }],
      [{ appId: 400, gameId: null }]
    )
    const imported = repo.listGames()[0]
    repo.updateGame(imported.id, { ...imported, status: 'jugando', notes: 'Conservar' })

    const enriched = repo.applySteamMetadata(400, {
      source: 'steam',
      catalogId: 400,
      title: 'Portal',
      description: 'Descripción de Steam',
      coverUrl: 'https://images/portal.jpg',
      backgroundUrl: 'https://images/portal-background.jpg',
      screenshots: ['https://images/portal-shot.jpg'],
      releasedAt: '2007-10-10',
      developers: ['Valve'],
      publishers: ['Valve'],
      genres: ['Puzzle'],
      platforms: ['Windows', 'Linux'],
      website: 'https://example.com/portal',
      metacritic: 90
    })

    expect(enriched).toMatchObject({
      description: 'Descripción de Steam',
      coverUrl: 'https://images/portal.jpg',
      platforms: ['Windows', 'Linux'],
      status: 'jugando',
      notes: 'Conservar'
    })
  })

  it('restores an aliased Steam title from ownership metadata', () => {
    const repo = makeRepo()
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [{ appId: 21110, title: 'F.E.A.R.: Extraction Point' }],
      [{ appId: 21110, gameId: null }]
    )
    const imported = repo.listGames()[0]
    repo.updateGame(imported.id, { ...imported, title: 'F.E.A.R.' })

    const repaired = repo.applySteamMetadata(21110, {
      source: 'steam',
      catalogId: 21110,
      title: 'Steam App 21110',
      description: 'Includes the base game and both expansions.',
      coverUrl: 'https://shared.akamai.steamstatic.com/steam/apps/21090/header.jpg',
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

    expect(repaired).toMatchObject({
      title: 'F.E.A.R.: Extraction Point',
      description: 'Includes the base game and both expansions.'
    })
  })

  it('restores a distinct ownership title when Store metadata creates a collision', () => {
    const repo = makeRepo()
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [
        { appId: 9050, title: 'DOOM 3' },
        { appId: 208200, title: 'DOOM 3: BFG Edition' }
      ],
      [
        { appId: 9050, gameId: null },
        { appId: 208200, gameId: null }
      ]
    )
    const edition = repo.listGames().find((game) => game.catalogId === 208200)!
    repo.updateGame(edition.id, { ...edition, title: 'DOOM 3' })

    const repaired = repo.applySteamMetadata(208200, {
      source: 'steam',
      catalogId: 208200,
      title: 'DOOM 3',
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

    expect(repaired.title).toBe('DOOM 3: BFG Edition')
  })

  it('fills missing metadata without replacing user edits or a local cover', () => {
    const repo = makeRepo()
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Portal' }],
      [{ appId: 400, gameId: null }]
    )
    const imported = repo.listGames()[0]
    const localCover = 'gamevault-image://local/123e4567-e89b-42d3-a456-426614174000.png'
    repo.updateGame(imported.id, {
      ...imported,
      title: 'Mi Portal',
      description: 'Descripción propia',
      coverUrl: localCover
    })

    const enriched = repo.applySteamMetadata(400, {
      source: 'steam',
      catalogId: 400,
      title: 'Portal',
      description: '',
      coverUrl: 'https://images/portal.jpg',
      backgroundUrl: 'https://images/background.jpg',
      screenshots: [],
      releasedAt: null,
      developers: ['Valve'],
      publishers: [],
      genres: [],
      platforms: [],
      website: null,
      metacritic: null
    })

    expect(enriched).toMatchObject({
      title: 'Mi Portal',
      description: 'Descripción propia',
      coverUrl: localCover,
      backgroundUrl: 'https://images/background.jpg',
      developers: ['Valve']
    })
  })

  it('replaces only a provisional title and recognizable legacy Steam artwork', () => {
    const repo = makeRepo()
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Steam App 400' }],
      [{ appId: 400, gameId: null }]
    )
    const imported = repo.listGames()[0]
    repo.updateGame(imported.id, {
      ...imported,
      coverUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/400/header.jpg'
    })

    const enriched = repo.applySteamMetadata(400, {
      source: 'steam',
      catalogId: 400,
      title: 'Portal',
      description: '',
      coverUrl: 'https://images/vertical.jpg',
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

    expect(enriched).toMatchObject({ title: 'Portal', coverUrl: 'https://images/vertical.jpg' })

    const customCover = 'https://example.com/steam/apps/400/header.jpg'
    repo.updateGame(enriched.id, { ...enriched, coverUrl: customCover })
    expect(
      repo.applySteamMetadata(400, {
        source: 'steam',
        catalogId: 400,
        title: 'Portal',
        description: '',
        coverUrl: 'https://images/new-vertical.jpg',
        backgroundUrl: null,
        screenshots: [],
        releasedAt: null,
        developers: [],
        publishers: [],
        genres: [],
        platforms: [],
        website: null,
        metacritic: null
      }).coverUrl
    ).toBe(customCover)
  })

  it('synchronizes Steam achievements while preserving a manual state override', () => {
    const repo = makeRepo()
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Portal' }],
      [{ appId: 400, gameId: null }]
    )
    repo.applySteamAchievementSnapshot(400, [
      {
        providerId: 'ESCAPE_00',
        name: 'Rata de laboratorio',
        description: 'Consigue el portal completo.',
        iconUrl: 'https://images/achievement.jpg',
        unlocked: false,
        unlockedAt: null
      },
      {
        providerId: 'OLD',
        name: 'Obsoleto',
        description: '',
        iconUrl: null,
        unlocked: false,
        unlockedAt: null
      }
    ])
    const imported = repo
      .listAchievements(repo.listGames()[0].id)
      .find((achievement) => achievement.name === 'Rata de laboratorio')
    if (!imported) throw new Error('Steam achievement was not imported')
    repo.updateAchievement(imported.id, { ...imported, unlocked: true, unlockedAt: null })

    repo.applySteamAchievementSnapshot(400, [
      {
        providerId: 'ESCAPE_00',
        name: 'Rata de laboratorio actualizada',
        description: 'Descripción actualizada.',
        iconUrl: 'https://images/achievement-new.jpg',
        unlocked: false,
        unlockedAt: null
      }
    ])

    expect(repo.listAchievements(repo.listGames()[0].id)).toEqual([
      expect.objectContaining({
        name: 'Rata de laboratorio actualizada',
        unlocked: true,
        providerUnlocked: false,
        manualOverride: true
      })
    ])
  })

  it('returns an imported achievement to its synchronized Steam state', () => {
    const repo = makeRepo()
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Portal' }],
      [{ appId: 400, gameId: null }]
    )
    repo.applySteamAchievementSnapshot(400, [
      {
        providerId: 'ESCAPE_00',
        name: 'Rata de laboratorio',
        description: '',
        iconUrl: null,
        unlocked: false,
        unlockedAt: null
      }
    ])
    const achievement = repo.listAchievements(repo.listGames()[0].id)[0]
    repo.updateAchievement(achievement.id, { ...achievement, unlocked: true })

    expect(repo.clearAchievementOverride(achievement.id)).toMatchObject({
      unlocked: false,
      provider: 'steam',
      providerUnlocked: false,
      manualOverride: null
    })
  })

  it('restores Steam unlock state and date when an override is cleared', () => {
    const repo = makeRepo()
    repo.connectSteamAccount(steamProfile)
    repo.applySteamOwnershipSnapshot(
      [{ appId: 400, title: 'Portal' }],
      [{ appId: 400, gameId: null }]
    )
    repo.applySteamAchievementSnapshot(400, [
      {
        providerId: 'ESCAPE_00',
        name: 'Rata de laboratorio',
        description: '',
        iconUrl: null,
        unlocked: true,
        unlockedAt: '2026-09-06'
      }
    ])
    const achievement = repo.listAchievements(repo.listGames()[0].id)[0]
    repo.updateAchievement(achievement.id, { ...achievement, unlocked: false, unlockedAt: null })

    expect(repo.clearAchievementOverride(achievement.id)).toMatchObject({
      unlocked: true,
      unlockedAt: '2026-09-06',
      providerUnlocked: true,
      manualOverride: null
    })
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
