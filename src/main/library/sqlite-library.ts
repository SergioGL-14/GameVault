import type Database from 'better-sqlite3'
import type { CatalogGameDetail } from '../../catalog/model'
import {
  CATALOG_METADATA_FIELDS,
  isUsableGameCard,
  mergeMissingGameMetadata,
  mergeProviderGameMetadata,
  normalizeGameTitle
} from '../../library/game-metadata'
import type { CatalogMetadataField } from '../../library/game-metadata'
import {
  validateAchievementInput,
  validateGameInput,
  validateProfileInput
} from '../../library/validation'
import type {
  Achievement,
  AddGameResult,
  AchievementInput,
  Game,
  GameInput,
  GameSource,
  GameStatus,
  LibraryStats,
  Profile,
  ProfileInput
} from '../../library/model'
import type {
  SteamAccount,
  SteamAchievement,
  SteamOwnedGame,
  SteamOwnershipResolution,
  SteamProfile
} from '../../steam/model'

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
  metadata_overrides: string
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
  provider: 'steam' | null
  provider_achievement_id: string | null
  provider_unlocked: number | null
  provider_unlocked_at: string | null
  manual_override: number | null
}

function parseList(value: string, gameId: number, field: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed
  } catch {
    // The contextual error below intentionally excludes persisted content.
  }
  throw new Error(`Datos dañados en el juego ${gameId}: el campo "${field}" no es una lista válida`)
}

function parseMetadataOverrides(value: string, gameId: number): Set<CatalogMetadataField> {
  const fields = parseList(value, gameId, 'metadata_overrides')
  const allowed = new Set<string>(CATALOG_METADATA_FIELDS)
  if (fields.some((field) => !allowed.has(field))) {
    throw new Error(`Datos dañados en el juego ${gameId}: los metadatos protegidos no son válidos`)
  }
  return new Set(fields as CatalogMetadataField[])
}

function toGame(row: Row, ownedOn: Game['ownedOn'] = []): Game {
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
    screenshots: parseList(row.screenshots, row.id, 'screenshots'),
    releasedAt: row.released_at,
    developers: parseList(row.developers, row.id, 'developers'),
    publishers: parseList(row.publishers, row.id, 'publishers'),
    genres: parseList(row.genres, row.id, 'genres'),
    platforms: parseList(row.platforms, row.id, 'platforms'),
    website: row.website,
    metacritic: row.metacritic,
    showcased: row.showcased === 1,
    completedAt: row.completed_at,
    addedAt: row.added_at,
    ownedOn
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
    unlockedAt: row.unlocked_at,
    provider: row.provider,
    providerUnlocked: row.provider_unlocked === null ? null : row.provider_unlocked === 1,
    manualOverride: row.manual_override === null ? null : row.manual_override === 1
  }
}

export interface LibraryRepository {
  listGames(): Game[]
  addGame(input: GameInput): AddGameResult
  getGame(id: number): Game | null
  createGame(input: GameInput): Game
  updateGame(id: number, input: GameInput): Game
  deleteGame(id: number): void
  listAchievements(gameId: number): Achievement[]
  createAchievement(gameId: number, input: AchievementInput): Achievement
  updateAchievement(id: number, input: AchievementInput): Achievement
  clearAchievementOverride(id: number): Achievement
  deleteAchievement(id: number): void
  getProfile(): Profile
  updateProfile(input: ProfileInput): Profile
  getStats(): LibraryStats
  getSteamAccount(): SteamAccount | null
  connectSteamAccount(profile: SteamProfile): SteamAccount
  disconnectSteamAccount(): void
  applySteamOwnershipSnapshot(
    games: SteamOwnedGame[],
    resolutions: SteamOwnershipResolution[],
    refreshedAt?: string
  ): Game[]
  listSteamOwnerships(): { appId: number; gameId: number }[]
  listPendingSteamMetadata(): { appId: number; gameId: number }[]
  applyCatalogMetadata(id: number, detail: CatalogGameDetail): Game
  applySteamMetadata(appId: number, detail: CatalogGameDetail): Game
  applySteamAchievementSnapshot(appId: number, achievements: SteamAchievement[]): void
}

export function createLibraryRepository(db: Database.Database): LibraryRepository {
  const insertGame = db.prepare(
    `INSERT INTO games (
       source, catalog_id, title, description, status, playtime_minutes, rating, notes,
       cover_url, background_url, screenshots, released_at, developers, publishers,
       genres, platforms, website, metacritic, metadata_overrides, showcased, completed_at
     ) VALUES (
       @source, @catalog_id, @title, @description, @status, @playtime_minutes, @rating, @notes,
       @cover_url, @background_url, @screenshots, @released_at, @developers, @publishers,
       @genres, @platforms, @website, @metacritic, @metadata_overrides, @showcased, @completed_at
     )`
  )
  const updateGameStmt = db.prepare(
    `UPDATE games SET
       source = @source, catalog_id = @catalog_id, title = @title, description = @description,
       status = @status, playtime_minutes = @playtime_minutes, rating = @rating, notes = @notes,
       cover_url = @cover_url, background_url = @background_url, screenshots = @screenshots,
       released_at = @released_at, developers = @developers, publishers = @publishers,
       genres = @genres, platforms = @platforms, website = @website, metacritic = @metacritic,
       metadata_overrides = @metadata_overrides,
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
      unlocked = @unlocked, unlocked_at = @unlocked_at,
      manual_override = CASE WHEN provider = 'steam' THEN @unlocked ELSE NULL END
      WHERE id = @id`
  )
  const deleteAchievementStmt = db.prepare('DELETE FROM achievements WHERE id = ?')
  const clearAchievementOverrideStmt = db.prepare(
    `UPDATE achievements SET manual_override = NULL,
       unlocked = COALESCE(provider_unlocked, unlocked),
       unlocked_at = CASE WHEN provider_unlocked = 1 THEN provider_unlocked_at ELSE NULL END
     WHERE id = ? AND provider = 'steam'`
  )
  const ownershipsStmt = db.prepare(
    `SELECT po.game_id, ea.provider FROM provider_ownerships po
     JOIN external_accounts ea ON ea.id = po.external_account_id
     WHERE po.active = 1`
  )

  function gameOwnerships(): Map<number, Game['ownedOn']> {
    const ownerships = new Map<number, Game['ownedOn']>()
    for (const row of ownershipsStmt.all() as { game_id: number; provider: 'steam' }[]) {
      const providers = ownerships.get(row.game_id) ?? []
      if (!providers.includes(row.provider)) providers.push(row.provider)
      ownerships.set(row.game_id, providers)
    }
    return ownerships
  }

  function currentGame(id: number): Game {
    return toGame(getGameStmt.get(id) as Row, gameOwnerships().get(id))
  }

  function gameValues(
    input: GameInput,
    existingCompletedAt: string | null,
    metadataOverrides: ReadonlySet<CatalogMetadataField> = new Set()
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
      metadata_overrides: JSON.stringify([...metadataOverrides]),
      showcased: input.showcased ? 1 : 0,
      completed_at: justCompleted
        ? new Date().toISOString()
        : noLongerCompleted
          ? null
          : existingCompletedAt
    }
  }

  function writeGame(
    id: number,
    input: GameInput,
    existing: Row,
    metadataOverrides: ReadonlySet<CatalogMetadataField>
  ): Game {
    updateGameStmt.run({
      ...gameValues(input, existing.completed_at, metadataOverrides),
      id
    })
    return currentGame(id)
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
      const ownerships = gameOwnerships()
      return (listGamesStmt.all() as Row[]).map((row) => toGame(row, ownerships.get(row.id)))
    },

    getGame(id: number): Game | null {
      const row = getGameStmt.get(id) as Row | undefined
      return row ? toGame(row, gameOwnerships().get(id)) : null
    },

    addGame(input: GameInput): AddGameResult {
      validateGameInput(input)
      return db.transaction(() => {
        const games = this.listGames()
        const source = input.source ?? 'manual'
        const exactCatalogMatch =
          source !== 'manual' && input.catalogId != null
            ? games.find((game) => game.source === source && game.catalogId === input.catalogId)
            : undefined
        const title = normalizeGameTitle(input.title)
        const existing =
          exactCatalogMatch ??
          games
            .filter(
              (game) =>
                (source === 'manual' || game.source === 'manual') &&
                normalizeGameTitle(game.title) === title
            )
            .sort((first, second) => first.id - second.id)[0]
        if (!existing) return { game: this.createGame(input), created: true }
        const row = getGameStmt.get(existing.id) as Row
        return {
          game: writeGame(
            existing.id,
            mergeMissingGameMetadata(existing, input),
            row,
            parseMetadataOverrides(row.metadata_overrides, row.id)
          ),
          created: false
        }
      })()
    },

    createGame(input: GameInput): Game {
      validateGameInput(input)
      const result = insertGame.run(gameValues(input, null)) as Database.RunResult
      return currentGame(Number(result.lastInsertRowid))
    },

    updateGame(id: number, input: GameInput): Game {
      validateGameInput(input)
      const existing = getGameStmt.get(id) as Row | undefined
      if (!existing) throw new Error(`Juego ${id} no encontrado`)
      const current = toGame(existing)
      const overrides = parseMetadataOverrides(existing.metadata_overrides, id)
      for (const field of CATALOG_METADATA_FIELDS) {
        if (
          Object.prototype.hasOwnProperty.call(input, field) &&
          JSON.stringify(current[field]) !== JSON.stringify(input[field])
        ) {
          overrides.add(field)
        }
      }
      return writeGame(id, input, existing, overrides)
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

    clearAchievementOverride(id: number): Achievement {
      if (clearAchievementOverrideStmt.run(id).changes !== 1) {
        throw new Error(`Logro de Steam ${id} no encontrado`)
      }
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
    },

    getSteamAccount(): SteamAccount | null {
      const row = db
        .prepare(
          `SELECT external_user_id, display_name, avatar_url, last_refreshed_at
           FROM external_accounts WHERE provider = 'steam' AND connected = 1`
        )
        .get() as
        | {
            external_user_id: string
            display_name: string
            avatar_url: string | null
            last_refreshed_at: string | null
          }
        | undefined
      return row
        ? {
            steamId: row.external_user_id,
            personaName: row.display_name,
            avatarUrl: row.avatar_url,
            lastRefreshedAt: row.last_refreshed_at
          }
        : null
    },

    connectSteamAccount(profile: SteamProfile): SteamAccount {
      db.transaction(() => {
        db.prepare("UPDATE external_accounts SET connected = 0 WHERE provider = 'steam'").run()
        db.prepare(
          `INSERT INTO external_accounts
             (provider, external_user_id, display_name, avatar_url, connected)
           VALUES ('steam', @steamId, @personaName, @avatarUrl, 1)
           ON CONFLICT(provider, external_user_id) DO UPDATE SET
             display_name = excluded.display_name,
             avatar_url = excluded.avatar_url,
             connected = 1`
        ).run(profile)
      })()
      const account = this.getSteamAccount()
      if (!account) throw new Error('No se pudo conectar la cuenta de Steam')
      return account
    },

    disconnectSteamAccount(): void {
      db.prepare("UPDATE external_accounts SET connected = 0 WHERE provider = 'steam'").run()
    },

    applySteamOwnershipSnapshot(
      games: SteamOwnedGame[],
      resolutions: SteamOwnershipResolution[],
      refreshedAt = new Date().toISOString()
    ): Game[] {
      const appIds = new Set(games.map((game) => game.appId))
      const resolutionByApp = new Map(resolutions.map((item) => [item.appId, item.gameId]))
      const resolvedGameIds = resolutions.flatMap((item) =>
        item.gameId === null ? [] : [item.gameId]
      )
      if (
        appIds.size !== games.length ||
        resolutionByApp.size !== resolutions.length ||
        resolutions.length !== games.length ||
        resolutions.some((item) => !appIds.has(item.appId))
      ) {
        throw new Error('La resolución de la biblioteca de Steam no está completa')
      }
      if (new Set(resolvedGameIds).size !== resolvedGameIds.length) {
        throw new Error('Dos aplicaciones de Steam no pueden asociarse con la misma ficha')
      }

      db.transaction(() => {
        const account = db
          .prepare("SELECT id FROM external_accounts WHERE provider = 'steam' AND connected = 1")
          .get() as { id: number } | undefined
        if (!account) throw new Error('No hay una cuenta de Steam conectada')
        for (const resolution of resolutions) {
          if (resolution.gameId === null) continue
          const conflicting = db
            .prepare(
              `SELECT 1 FROM provider_ownerships po
               JOIN external_accounts ea ON ea.id = po.external_account_id
               WHERE ea.provider = 'steam' AND po.game_id = ? AND po.provider_game_id <> ?`
            )
            .get(resolution.gameId, String(resolution.appId))
          if (conflicting) {
            throw new Error('Dos aplicaciones de Steam no pueden asociarse con la misma ficha')
          }
        }
        db.prepare('UPDATE provider_ownerships SET active = 0 WHERE external_account_id = ?').run(
          account.id
        )

        for (const game of games) {
          let gameId = resolutionByApp.get(game.appId) ?? null
          if (gameId === null) {
            const input: GameInput = {
              source: 'steam',
              catalogId: game.appId,
              title: game.title,
              status: 'pendiente'
            }
            validateGameInput(input)
            gameId = Number(insertGame.run(gameValues(input, null)).lastInsertRowid)
          } else if (!getGameStmt.get(gameId)) {
            throw new Error(`Juego ${gameId} no encontrado`)
          }
          db.prepare(
            `INSERT INTO provider_ownerships
               (external_account_id, game_id, provider_game_id, provider_title, active,
                first_seen_at, last_seen_at)
             VALUES (?, ?, ?, ?, 1, ?, ?)
              ON CONFLICT(external_account_id, provider_game_id) DO UPDATE SET
                game_id = excluded.game_id,
                provider_title = excluded.provider_title,
                active = 1,
                last_seen_at = excluded.last_seen_at,
                metadata_refreshed_at = CASE
                  WHEN provider_ownerships.game_id = excluded.game_id
                    THEN provider_ownerships.metadata_refreshed_at
                  ELSE NULL
                END`
          ).run(account.id, gameId, String(game.appId), game.title, refreshedAt, refreshedAt)
        }
        db.prepare('UPDATE external_accounts SET last_refreshed_at = ? WHERE id = ?').run(
          refreshedAt,
          account.id
        )
        db.prepare(
          `UPDATE provider_ownerships SET metadata_refreshed_at = NULL
           WHERE external_account_id = ? AND game_id IN (
             SELECT id FROM games
             WHERE (cover_url LIKE 'http%' AND metadata_overrides NOT LIKE '%"coverUrl"%')
                OR (background_url LIKE 'http%' AND metadata_overrides NOT LIKE '%"backgroundUrl"%')
           )`
        ).run(account.id)
      })()
      return this.listGames()
    },

    listSteamOwnerships(): { appId: number; gameId: number }[] {
      const account = db
        .prepare("SELECT id FROM external_accounts WHERE provider = 'steam' AND connected = 1")
        .get() as { id: number } | undefined
      if (!account) return []
      return db
        .prepare(
          `SELECT provider_game_id, game_id FROM provider_ownerships
           WHERE external_account_id = ? AND active = 1`
        )
        .all(account.id)
        .map((row) => {
          const ownership = row as { provider_game_id: string; game_id: number }
          return { appId: Number(ownership.provider_game_id), gameId: ownership.game_id }
        })
    },

    listPendingSteamMetadata(): { appId: number; gameId: number }[] {
      const account = db
        .prepare("SELECT id FROM external_accounts WHERE provider = 'steam' AND connected = 1")
        .get() as { id: number } | undefined
      if (!account) return []
      return db
        .prepare(
          `SELECT provider_game_id, game_id FROM provider_ownerships
           WHERE external_account_id = ? AND metadata_refreshed_at IS NULL
           ORDER BY id`
        )
        .all(account.id)
        .map((row) => {
          const ownership = row as { provider_game_id: string; game_id: number }
          return { appId: Number(ownership.provider_game_id), gameId: ownership.game_id }
        })
    },

    applyCatalogMetadata(id: number, detail: CatalogGameDetail): Game {
      return db.transaction(() => {
        const current = this.getGame(id)
        if (!current) throw new Error(`Juego ${id} no encontrado`)
        if (
          current.source === 'manual' ||
          current.catalogId === null ||
          detail.source !== current.source ||
          detail.catalogId !== current.catalogId
        ) {
          throw new Error('La identidad del catálogo no coincide con la ficha')
        }
        const row = getGameStmt.get(id) as Row
        return writeGame(
          id,
          mergeProviderGameMetadata(
            current,
            { ...detail, status: current.status },
            parseMetadataOverrides(row.metadata_overrides, id)
          ),
          row,
          parseMetadataOverrides(row.metadata_overrides, id)
        )
      })()
    },

    applySteamMetadata(appId: number, detail: CatalogGameDetail): Game {
      validateGameInput({ ...detail, status: 'pendiente' })
      return db.transaction(() => {
        const row = db
          .prepare(
            `SELECT g.*, po.id AS ownership_id, po.provider_title FROM games g
             JOIN provider_ownerships po ON po.game_id = g.id
             JOIN external_accounts ea ON ea.id = po.external_account_id
             WHERE ea.provider = 'steam' AND ea.connected = 1 AND po.provider_game_id = ?`
          )
          .get(String(appId)) as
          (Row & { ownership_id: number; provider_title: string }) | undefined
        if (!row) throw new Error(`No existe propiedad Steam para la aplicación ${appId}`)
        const current = toGame(row, ['steam'])
        const overrides = parseMetadataOverrides(row.metadata_overrides, current.id)
        const catalogTitleCollision = this.listGames().some(
          (game) =>
            game.id !== current.id &&
            normalizeGameTitle(game.title) === normalizeGameTitle(detail.title)
        )
        const useOwnershipTitle =
          !overrides.has('title') &&
          (detail.title === `Steam App ${appId}` ||
            (catalogTitleCollision &&
              normalizeGameTitle(current.title) === normalizeGameTitle(detail.title) &&
              normalizeGameTitle(row.provider_title) !== normalizeGameTitle(detail.title)))
        const currentMetadata = useOwnershipTitle
          ? { ...current, title: row.provider_title }
          : current
        const incomingMetadata = useOwnershipTitle
          ? { ...detail, title: row.provider_title }
          : detail
        const updated = writeGame(
          current.id,
          mergeProviderGameMetadata(
            currentMetadata,
            { ...incomingMetadata, status: current.status },
            overrides
          ),
          row,
          overrides
        )
        db.prepare(
          `UPDATE provider_ownerships SET metadata_refreshed_at = ?
           WHERE id = ?`
        ).run(isUsableGameCard(updated) ? new Date().toISOString() : null, row.ownership_id)
        return updated
      })()
    },

    applySteamAchievementSnapshot(appId: number, achievements: SteamAchievement[]): void {
      const ownership = db
        .prepare(
          `SELECT po.game_id FROM provider_ownerships po
           JOIN external_accounts ea ON ea.id = po.external_account_id
           WHERE ea.provider = 'steam' AND ea.connected = 1 AND po.active = 1
             AND po.provider_game_id = ?`
        )
        .get(String(appId)) as { game_id: number } | undefined
      if (!ownership) throw new Error(`No existe propiedad Steam para la aplicación ${appId}`)
      const ownershipCount = db
        .prepare(
          `SELECT COUNT(*) AS count FROM provider_ownerships po
           JOIN external_accounts ea ON ea.id = po.external_account_id
           WHERE ea.provider = 'steam' AND ea.connected = 1 AND po.active = 1
             AND po.game_id = ?`
        )
        .get(ownership.game_id) as { count: number }
      if (ownershipCount.count !== 1) {
        throw new Error('No se pueden sincronizar logros de varios AppID en la misma ficha')
      }

      db.transaction(() => {
        const existing = db
          .prepare("SELECT * FROM achievements WHERE game_id = ? AND provider = 'steam'")
          .all(ownership.game_id) as AchievementRow[]
        const byProviderId = new Map(existing.map((row) => [row.provider_achievement_id, row]))
        const incomingIds = new Set(achievements.map((achievement) => achievement.providerId))
        const insert = db.prepare(
          `INSERT INTO achievements
             (game_id, name, description, icon_url, unlocked, unlocked_at,
              provider, provider_achievement_id, provider_unlocked, provider_unlocked_at)
            VALUES (?, ?, ?, ?, ?, ?, 'steam', ?, ?, ?)`
        )
        const update = db.prepare(
          `UPDATE achievements SET name = ?, description = ?, icon_url = ?,
             provider_unlocked = ?, provider_unlocked_at = ?, unlocked = ?, unlocked_at = ?
             WHERE id = ?`
        )
        for (const achievement of achievements) {
          const row = byProviderId.get(achievement.providerId)
          if (!row) {
            insert.run(
              ownership.game_id,
              achievement.name,
              achievement.description,
              achievement.iconUrl,
              achievement.unlocked ? 1 : 0,
              achievement.unlockedAt,
              achievement.providerId,
              achievement.unlocked ? 1 : 0,
              achievement.unlockedAt
            )
            continue
          }
          const unlocked =
            row.manual_override === null ? achievement.unlocked : row.manual_override === 1
          update.run(
            achievement.name,
            achievement.description,
            achievement.iconUrl,
            achievement.unlocked ? 1 : 0,
            achievement.unlockedAt,
            unlocked ? 1 : 0,
            row.manual_override === null ? achievement.unlockedAt : row.unlocked_at,
            row.id
          )
        }
        const remove = db.prepare('DELETE FROM achievements WHERE id = ?')
        for (const row of existing) {
          if (row.provider_achievement_id && !incomingIds.has(row.provider_achievement_id)) {
            remove.run(row.id)
          }
        }
      })()
    }
  }
}
