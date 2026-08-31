import type Database from 'better-sqlite3'
import {
  validateAchievementInput,
  validateGameInput,
  validateProfileInput
} from '../../library/validation'
import type {
  Achievement,
  AchievementInput,
  Game,
  GameInput,
  GameSource,
  GameStatus,
  LibraryStats,
  Profile,
  ProfileInput
} from '../../library/model'

type Row = {
  id: number
  source: GameSource
  catalog_id: number | null
  title: string
  description: string
  status: GameStatus
  playtime_minutes: number
  rating: number | null
  notes: string
  cover_url: string | null
  background_url: string | null
  screenshots: string
  released_at: string | null
  developers: string
  publishers: string
  genres: string
  platforms: string
  website: string | null
  metacritic: number | null
  showcased: number
  completed_at: string | null
  added_at: string
}

type AchievementRow = {
  id: number
  game_id: number
  name: string
  description: string
  icon_url: string | null
  unlocked: number
  unlocked_at: string | null
}

function parseList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function toGame(row: Row): Game {
  return {
    id: row.id,
    source: row.source,
    catalogId: row.catalog_id,
    title: row.title,
    description: row.description,
    status: row.status,
    playtimeMinutes: row.playtime_minutes,
    rating: row.rating,
    notes: row.notes,
    coverUrl: row.cover_url,
    backgroundUrl: row.background_url,
    screenshots: parseList(row.screenshots),
    releasedAt: row.released_at,
    developers: parseList(row.developers),
    publishers: parseList(row.publishers),
    genres: parseList(row.genres),
    platforms: parseList(row.platforms),
    website: row.website,
    metacritic: row.metacritic,
    showcased: row.showcased === 1,
    completedAt: row.completed_at,
    addedAt: row.added_at
  }
}

function toAchievement(row: AchievementRow): Achievement {
  return {
    id: row.id,
    gameId: row.game_id,
    name: row.name,
    description: row.description,
    iconUrl: row.icon_url,
    unlocked: row.unlocked === 1,
    unlockedAt: row.unlocked_at
  }
}

export interface LibraryRepository {
  listGames(): Game[]
  createGame(input: GameInput): Game
  updateGame(id: number, input: GameInput): Game
  deleteGame(id: number): void
  listAchievements(gameId: number): Achievement[]
  createAchievement(gameId: number, input: AchievementInput): Achievement
  updateAchievement(id: number, input: AchievementInput): Achievement
  deleteAchievement(id: number): void
  getProfile(): Profile
  updateProfile(input: ProfileInput): Profile
  getStats(): LibraryStats
}

export function createLibraryRepository(db: Database.Database): LibraryRepository {
  const insertGame = db.prepare(
    `INSERT INTO games (
       source, catalog_id, title, description, status, playtime_minutes, rating, notes,
       cover_url, background_url, screenshots, released_at, developers, publishers,
       genres, platforms, website, metacritic, showcased, completed_at
     ) VALUES (
       @source, @catalog_id, @title, @description, @status, @playtime_minutes, @rating, @notes,
       @cover_url, @background_url, @screenshots, @released_at, @developers, @publishers,
       @genres, @platforms, @website, @metacritic, @showcased, @completed_at
     )`
  )
  const updateGameStmt = db.prepare(
    `UPDATE games SET
       source = @source, catalog_id = @catalog_id, title = @title, description = @description,
       status = @status, playtime_minutes = @playtime_minutes, rating = @rating, notes = @notes,
       cover_url = @cover_url, background_url = @background_url, screenshots = @screenshots,
       released_at = @released_at, developers = @developers, publishers = @publishers,
       genres = @genres, platforms = @platforms, website = @website, metacritic = @metacritic,
       showcased = @showcased, completed_at = @completed_at
     WHERE id = @id`
  )
  const deleteGameStmt = db.prepare('DELETE FROM games WHERE id = ?')
  const getGameStmt = db.prepare('SELECT * FROM games WHERE id = ?')
  const listGamesStmt = db.prepare('SELECT * FROM games ORDER BY title COLLATE NOCASE')
  const getAchievementStmt = db.prepare('SELECT * FROM achievements WHERE id = ?')
  const listAchievementsStmt = db.prepare(
    'SELECT * FROM achievements WHERE game_id = ? ORDER BY name COLLATE NOCASE, id'
  )
  const insertAchievement = db.prepare(
    `INSERT INTO achievements (game_id, name, description, icon_url, unlocked, unlocked_at)
     VALUES (@game_id, @name, @description, @icon_url, @unlocked, @unlocked_at)`
  )
  const updateAchievementStmt = db.prepare(
    `UPDATE achievements SET name = @name, description = @description, icon_url = @icon_url,
     unlocked = @unlocked, unlocked_at = @unlocked_at WHERE id = @id`
  )
  const deleteAchievementStmt = db.prepare('DELETE FROM achievements WHERE id = ?')

  function gameValues(
    input: GameInput,
    existingCompletedAt: string | null
  ): Record<string, unknown> {
    const justCompleted = input.status === 'completado' && existingCompletedAt === null
    const noLongerCompleted = input.status !== 'completado' && existingCompletedAt !== null
    return {
      source: input.source ?? 'manual',
      catalog_id: input.catalogId ?? null,
      title: input.title.trim(),
      description: input.description ?? '',
      status: input.status,
      playtime_minutes: input.playtimeMinutes ?? 0,
      rating: input.rating ?? null,
      notes: input.notes ?? '',
      cover_url: input.coverUrl ?? null,
      background_url: input.backgroundUrl ?? null,
      screenshots: JSON.stringify(input.screenshots ?? []),
      released_at: input.releasedAt ?? null,
      developers: JSON.stringify(input.developers ?? []),
      publishers: JSON.stringify(input.publishers ?? []),
      genres: JSON.stringify(input.genres ?? []),
      platforms: JSON.stringify(input.platforms ?? []),
      website: input.website ?? null,
      metacritic: input.metacritic ?? null,
      showcased: input.showcased ? 1 : 0,
      completed_at: justCompleted
        ? new Date().toISOString()
        : noLongerCompleted
          ? null
          : existingCompletedAt
    }
  }

  function achievementValues(input: AchievementInput): Record<string, unknown> {
    return {
      name: input.name.trim(),
      description: input.description ?? '',
      icon_url: input.iconUrl || null,
      unlocked: input.unlocked ? 1 : 0,
      unlocked_at: input.unlocked ? (input.unlockedAt ?? null) : null
    }
  }

  return {
    listGames(): Game[] {
      return (listGamesStmt.all() as Row[]).map(toGame)
    },

    createGame(input: GameInput): Game {
      validateGameInput(input)
      const result = insertGame.run(gameValues(input, null)) as Database.RunResult
      return toGame(getGameStmt.get(result.lastInsertRowid) as Row)
    },

    updateGame(id: number, input: GameInput): Game {
      validateGameInput(input)
      const existing = getGameStmt.get(id) as Row | undefined
      if (!existing) throw new Error(`Juego ${id} no encontrado`)
      updateGameStmt.run({ ...gameValues(input, existing.completed_at), id })
      return toGame(getGameStmt.get(id) as Row)
    },

    deleteGame(id: number): void {
      deleteGameStmt.run(id)
    },

    listAchievements(gameId: number): Achievement[] {
      return (listAchievementsStmt.all(gameId) as AchievementRow[]).map(toAchievement)
    },

    createAchievement(gameId: number, input: AchievementInput): Achievement {
      validateAchievementInput(input)
      if (!getGameStmt.get(gameId)) throw new Error(`Juego ${gameId} no encontrado`)
      const result = insertAchievement.run({
        game_id: gameId,
        ...achievementValues(input)
      }) as Database.RunResult
      return toAchievement(getAchievementStmt.get(result.lastInsertRowid) as AchievementRow)
    },

    updateAchievement(id: number, input: AchievementInput): Achievement {
      validateAchievementInput(input)
      if (!getAchievementStmt.get(id)) throw new Error(`Logro ${id} no encontrado`)
      updateAchievementStmt.run({ id, ...achievementValues(input) })
      return toAchievement(getAchievementStmt.get(id) as AchievementRow)
    },

    deleteAchievement(id: number): void {
      deleteAchievementStmt.run(id)
    },

    getProfile(): Profile {
      const row = db
        .prepare(
          'SELECT display_name, about, location, avatar_url, background_url FROM profile WHERE id = 1'
        )
        .get() as
        | {
            display_name: string
            about: string
            location: string
            avatar_url: string | null
            background_url: string | null
          }
        | undefined
      return {
        displayName: row?.display_name ?? 'Jugador',
        about: row?.about ?? '',
        location: row?.location ?? '',
        avatarUrl: row?.avatar_url ?? null,
        backgroundUrl: row?.background_url ?? null
      }
    },

    updateProfile(input: ProfileInput): Profile {
      validateProfileInput(input)
      const profile = {
        displayName: input.displayName.trim(),
        about: input.about,
        location: input.location.trim(),
        avatarUrl: input.avatarUrl || null,
        backgroundUrl: input.backgroundUrl || null
      }
      db.prepare(
        `UPDATE profile SET display_name = ?, about = ?, location = ?, avatar_url = ?,
         background_url = ? WHERE id = 1`
      ).run(
        profile.displayName,
        profile.about,
        profile.location,
        profile.avatarUrl,
        profile.backgroundUrl
      )
      return profile
    },

    getStats(): LibraryStats {
      const rows = db
        .prepare(
          `SELECT status, COUNT(*) AS count, COALESCE(SUM(playtime_minutes), 0) AS playtime
           FROM games GROUP BY status`
        )
        .all() as { status: GameStatus; count: number; playtime: number }[]
      const byStatus = new Map(rows.map((row) => [row.status, row]))
      const achievementStats = db
        .prepare(
          `SELECT COUNT(*) AS total, COALESCE(SUM(unlocked), 0) AS unlocked FROM achievements`
        )
        .get() as { total: number; unlocked: number }
      return {
        totalGames: rows.reduce((sum, row) => sum + row.count, 0),
        completed: byStatus.get('completado')?.count ?? 0,
        playing: byStatus.get('jugando')?.count ?? 0,
        totalPlaytimeMinutes: rows.reduce((sum, row) => sum + row.playtime, 0),
        totalAchievements: achievementStats.total,
        unlockedAchievements: achievementStats.unlocked
      }
    }
  }
}
