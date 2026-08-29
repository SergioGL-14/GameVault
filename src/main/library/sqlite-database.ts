import Database from 'better-sqlite3'

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
  metacritic: 'INTEGER'
}

function allowSteamSource(db: Database.Database): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'games'")
    .get() as { sql: string } | undefined
  if (row?.sql.includes("'steam'")) return

  db.transaction(() => {
    db.exec('DROP INDEX IF EXISTS games_catalog_source_id')
    db.exec('ALTER TABLE games RENAME TO games_before_steam')
    db.exec(GAME_TABLE)
    db.exec(`
      INSERT INTO games (
        id, source, catalog_id, title, description, status, playtime_minutes, rating, notes,
        cover_path, cover_url, background_url, screenshots, released_at, developers, publishers,
        genres, platforms, website, metacritic, showcased, completed_at, added_at
      )
      SELECT
        id, source, catalog_id, title, description, status, playtime_minutes, rating, notes,
        cover_path, cover_url, background_url, screenshots, released_at, developers, publishers,
        genres, platforms, website, metacritic, showcased, completed_at, added_at
      FROM games_before_steam;
      DROP TABLE games_before_steam;
    `)
  })()
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

export function openDatabase(file: string): Database.Database {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  addMissingColumns(db, 'games', GAME_COLUMNS)
  addMissingColumns(db, 'profile', PROFILE_COLUMNS)
  allowSteamSource(db)
  db.exec(`
    UPDATE games SET cover_url = cover_path WHERE cover_url IS NULL AND cover_path IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS games_catalog_source_id
      ON games(source, catalog_id) WHERE catalog_id IS NOT NULL;
  `)
  return db
}
