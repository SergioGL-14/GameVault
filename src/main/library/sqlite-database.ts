import Database from 'better-sqlite3'

const SCHEMA_VERSION = 8

const GAME_TABLE = `CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','steam','rawg')),
  catalog_id INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('jugando','completado','pendiente','abandonado','deseado')),
  playtime_minutes INTEGER NOT NULL DEFAULT 0,
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),
  notes TEXT NOT NULL DEFAULT '',
  cover_path TEXT,
  cover_url TEXT,
  background_url TEXT,
  screenshots TEXT NOT NULL DEFAULT '[]',
  released_at TEXT,
  developers TEXT NOT NULL DEFAULT '[]',
  publishers TEXT NOT NULL DEFAULT '[]',
  genres TEXT NOT NULL DEFAULT '[]',
  platforms TEXT NOT NULL DEFAULT '[]',
  website TEXT,
  metacritic INTEGER CHECK (metacritic BETWEEN 0 AND 100),
  metadata_overrides TEXT NOT NULL DEFAULT '[]',
  showcased INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);`

export const SCHEMA = `
${GAME_TABLE}
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  display_name TEXT NOT NULL,
  about TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  background_url TEXT
);

INSERT OR IGNORE INTO profile (id, display_name) VALUES (1, 'Jugador');
`

const ACHIEVEMENT_SCHEMA = `
CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon_url TEXT,
  unlocked INTEGER NOT NULL DEFAULT 0 CHECK (unlocked IN (0, 1)),
  unlocked_at TEXT,
  provider TEXT CHECK (provider IS NULL OR provider = 'steam'),
  provider_achievement_id TEXT,
  provider_unlocked INTEGER CHECK (provider_unlocked IS NULL OR provider_unlocked IN (0, 1)),
  provider_unlocked_at TEXT,
  manual_override INTEGER CHECK (manual_override IS NULL OR manual_override IN (0, 1)),
  CHECK (unlocked = 1 OR unlocked_at IS NULL)
);
CREATE INDEX IF NOT EXISTS achievements_game_id ON achievements(game_id);
`

const ACHIEVEMENT_COLUMNS: Record<string, string> = {
  provider: "TEXT CHECK (provider IS NULL OR provider = 'steam')",
  provider_achievement_id: 'TEXT',
  provider_unlocked: 'INTEGER CHECK (provider_unlocked IS NULL OR provider_unlocked IN (0, 1))',
  provider_unlocked_at: 'TEXT',
  manual_override: 'INTEGER CHECK (manual_override IS NULL OR manual_override IN (0, 1))'
}

const OWNERSHIP_SCHEMA = `
CREATE TABLE IF NOT EXISTS external_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  connected INTEGER NOT NULL DEFAULT 1 CHECK (connected IN (0, 1)),
  last_refreshed_at TEXT,
  UNIQUE (provider, external_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS external_accounts_one_connected_provider
  ON external_accounts(provider) WHERE connected = 1;

CREATE TABLE IF NOT EXISTS provider_ownerships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_account_id INTEGER NOT NULL REFERENCES external_accounts(id) ON DELETE RESTRICT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  provider_game_id TEXT NOT NULL,
  provider_title TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  metadata_refreshed_at TEXT,
  UNIQUE (external_account_id, provider_game_id)
);
CREATE INDEX IF NOT EXISTS provider_ownerships_game_id ON provider_ownerships(game_id);
CREATE INDEX IF NOT EXISTS provider_ownerships_account_active
  ON provider_ownerships(external_account_id, active);
`

const OWNERSHIP_COLUMNS: Record<string, string> = {
  metadata_refreshed_at: 'TEXT'
}

const GAME_COLUMNS: Record<string, string> = {
  source: "TEXT NOT NULL DEFAULT 'manual'",
  catalog_id: 'INTEGER',
  description: "TEXT NOT NULL DEFAULT ''",
  cover_url: 'TEXT',
  background_url: 'TEXT',
  screenshots: "TEXT NOT NULL DEFAULT '[]'",
  released_at: 'TEXT',
  developers: "TEXT NOT NULL DEFAULT '[]'",
  publishers: "TEXT NOT NULL DEFAULT '[]'",
  genres: "TEXT NOT NULL DEFAULT '[]'",
  platforms: "TEXT NOT NULL DEFAULT '[]'",
  website: 'TEXT',
  metacritic: 'INTEGER',
  metadata_overrides: "TEXT NOT NULL DEFAULT '[]'"
}

function needsSteamSourceMigration(db: Database.Database): boolean {
  const columns = db.prepare('PRAGMA table_info(games)').all() as { name: string }[]
  if (columns.length === 0 || !columns.some(({ name }) => name === 'source'))
    return columns.length > 0

  db.exec('SAVEPOINT gamevault_source_probe')
  try {
    db.prepare(
      "INSERT INTO games (source, title) VALUES ('steam', '__gamevault_source_probe__')"
    ).run()
    db.exec('ROLLBACK TO gamevault_source_probe; RELEASE gamevault_source_probe')
    return false
  } catch {
    db.exec('ROLLBACK TO gamevault_source_probe; RELEASE gamevault_source_probe')
    return true
  }
}

function allowSteamSource(db: Database.Database): void {
  const replacementTable = GAME_TABLE.replace(
    'CREATE TABLE IF NOT EXISTS games',
    'CREATE TABLE games_with_steam'
  )
  db.exec(`
      ${replacementTable}
      INSERT INTO games_with_steam (
        id, source, catalog_id, title, description, status, playtime_minutes, rating, notes,
        cover_path, cover_url, background_url, screenshots, released_at, developers, publishers,
        genres, platforms, website, metacritic, metadata_overrides, showcased, completed_at, added_at
      )
      SELECT
        id, source, catalog_id, title, description, status, playtime_minutes, rating, notes,
        cover_path, cover_url, background_url, screenshots, released_at, developers, publishers,
        genres, platforms, website, metacritic, metadata_overrides, showcased, completed_at, added_at
      FROM games;
      DROP TABLE games;
      ALTER TABLE games_with_steam RENAME TO games;
    `)
}

const PROFILE_COLUMNS: Record<string, string> = {
  location: "TEXT NOT NULL DEFAULT ''",
  avatar_url: 'TEXT',
  background_url: 'TEXT'
}

function addMissingColumns(
  db: Database.Database,
  table: string,
  columns: Record<string, string>
): void {
  const existing = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name)
  )
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
  }
}

function isSteamMedia(value: string | null): boolean {
  if (!value) return false
  try {
    const host = new URL(value).hostname
    return host.endsWith('.steamstatic.com') || host === 'steamcdn-a.akamaihd.net'
  } catch {
    return false
  }
}

function preserveExistingMetadataEdits(db: Database.Database): void {
  const rows = db
    .prepare(
      `SELECT id, title, description, cover_url, background_url, screenshots, released_at,
              developers, publishers, genres, platforms, website, metacritic
       FROM games`
    )
    .all() as {
    id: number
    title: string
    description: string
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
  }[]
  const update = db.prepare('UPDATE games SET metadata_overrides = ? WHERE id = ?')
  for (const row of rows) {
    // Older schemas have no provenance, so preserving existing values is safer than guessing
    // whether text was edited. Recognizable Steam media remains provider-managed.
    const fields = [
      row.title.trim() ? 'title' : null,
      row.description.trim() ? 'description' : null,
      row.cover_url && !isSteamMedia(row.cover_url) ? 'coverUrl' : null,
      row.background_url && !isSteamMedia(row.background_url) ? 'backgroundUrl' : null,
      row.screenshots !== '[]' ? 'screenshots' : null,
      row.released_at ? 'releasedAt' : null,
      row.developers !== '[]' ? 'developers' : null,
      row.publishers !== '[]' ? 'publishers' : null,
      row.genres !== '[]' ? 'genres' : null,
      row.platforms !== '[]' ? 'platforms' : null,
      row.website ? 'website' : null,
      row.metacritic !== null ? 'metacritic' : null
    ].filter((field): field is string => field !== null)
    update.run(JSON.stringify(fields), row.id)
  }
}

function requeueIncompleteSteamMetadata(db: Database.Database): void {
  const rows = db
    .prepare(
      `SELECT ownership.id, game.title, game.description, game.cover_url, game.background_url,
              game.metadata_overrides
       FROM provider_ownerships ownership
       JOIN external_accounts account ON account.id = ownership.external_account_id
       JOIN games game ON game.id = ownership.game_id
       WHERE account.provider = 'steam'`
    )
    .all() as {
    id: number
    title: string
    description: string
    cover_url: string | null
    background_url: string | null
    metadata_overrides: string
  }[]
  const requeue = db.prepare(
    'UPDATE provider_ownerships SET metadata_refreshed_at = NULL WHERE id = ?'
  )
  for (const row of rows) {
    const overrides = new Set<string>(JSON.parse(row.metadata_overrides))
    if (
      !row.title.trim() ||
      !row.description.trim() ||
      !row.cover_url?.trim() ||
      (isSteamMedia(row.cover_url) && !overrides.has('coverUrl')) ||
      (isSteamMedia(row.background_url) && !overrides.has('backgroundUrl'))
    ) {
      requeue.run(row.id)
    }
  }
}

/** Opens and upgrades a database atomically, closing it before any initialization error escapes. */
export function openDatabase(file: string): Database.Database {
  const db = new Database(file)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    const version = db.pragma('user_version', { simple: true }) as number
    if (version > SCHEMA_VERSION) {
      throw new Error(`Unsupported database schema version ${version}`)
    }

    const rebuildGames = needsSteamSourceMigration(db)
    if (rebuildGames) db.pragma('foreign_keys = OFF')

    db.transaction(() => {
      db.exec(SCHEMA)
      addMissingColumns(db, 'games', GAME_COLUMNS)
      addMissingColumns(db, 'profile', PROFILE_COLUMNS)
      if (rebuildGames) allowSteamSource(db)
      db.exec(ACHIEVEMENT_SCHEMA)
      addMissingColumns(db, 'achievements', ACHIEVEMENT_COLUMNS)
      if (version < 4) {
        db.exec(`
          UPDATE achievements SET provider_unlocked_at = unlocked_at
          WHERE provider = 'steam' AND provider_unlocked = 1 AND manual_override IS NULL
            AND provider_unlocked_at IS NULL;
        `)
      }
      db.exec(OWNERSHIP_SCHEMA)
      addMissingColumns(db, 'provider_ownerships', OWNERSHIP_COLUMNS)
      db.exec(
        'UPDATE games SET cover_url = cover_path WHERE cover_url IS NULL AND cover_path IS NOT NULL'
      )
      if (version === 5 || version === 6) {
        // Re-run Steam enrichment once so persisted alias metadata is repaired by the current mapper.
        db.exec(`
          UPDATE provider_ownerships SET metadata_refreshed_at = NULL
          WHERE external_account_id IN (
            SELECT id FROM external_accounts WHERE provider = 'steam'
          );
        `)
      }
      if (version < 8) {
        preserveExistingMetadataEdits(db)
        requeueIncompleteSteamMetadata(db)
      }
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS games_catalog_source_id
          ON games(source, catalog_id) WHERE catalog_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS achievements_provider_id
          ON achievements(game_id, provider, provider_achievement_id)
          WHERE provider IS NOT NULL AND provider_achievement_id IS NOT NULL;
      `)

      const foreignKeyViolations = db.pragma('foreign_key_check') as unknown[]
      if (foreignKeyViolations.length > 0) {
        throw new Error('Foreign key check failed during database initialization')
      }
      db.pragma(`user_version = ${SCHEMA_VERSION}`)
    })()

    if (rebuildGames) db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new Error('Could not enable SQLite foreign key enforcement')
    }
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
