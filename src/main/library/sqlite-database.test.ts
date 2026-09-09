import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { openDatabase } from './sqlite-database'

function createIntermediateSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','rawg')),
      catalog_id INTEGER,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pendiente',
      playtime_minutes INTEGER NOT NULL DEFAULT 0,
      rating INTEGER,
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
      metacritic INTEGER,
      showcased INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE profile (
      id INTEGER PRIMARY KEY,
      display_name TEXT NOT NULL,
      about TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      background_url TEXT
    );
    INSERT INTO profile (id, display_name) VALUES (1, 'Jugador');
    CREATE TABLE achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon_url TEXT,
      unlocked INTEGER NOT NULL DEFAULT 0,
      unlocked_at TEXT
    );
  `)
}

describe('migraciones SQLite', () => {
  it('amplía el esquema inicial conservando juegos, perfil y carátula', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gamevault-'))
    const file = join(directory, 'legacy.db')
    try {
      const legacy = new Database(file)
      legacy.exec(`
        CREATE TABLE games (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pendiente',
          playtime_minutes INTEGER NOT NULL DEFAULT 0,
          rating INTEGER,
          notes TEXT NOT NULL DEFAULT '',
          cover_path TEXT,
          showcased INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT,
          added_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO games (title, cover_path) VALUES ('Portal', 'https://images/portal.jpg');
        CREATE TABLE profile (
          id INTEGER PRIMARY KEY,
          display_name TEXT NOT NULL,
          about TEXT NOT NULL DEFAULT ''
        );
        INSERT INTO profile (id, display_name, about) VALUES (1, 'Galvik', 'Coleccionista');
      `)
      legacy.close()

      const migrated = openDatabase(file)
      migrated
        .prepare("INSERT INTO games (source, catalog_id, title) VALUES ('steam', 400, 'Portal 2')")
        .run()
      migrated
        .prepare("INSERT INTO achievements (game_id, name) VALUES (1, 'Sujeto de pruebas')")
        .run()
      const game = migrated.prepare('SELECT title, cover_url, screenshots FROM games').get() as {
        title: string
        cover_url: string
        screenshots: string
      }
      const profile = migrated
        .prepare('SELECT display_name, location, avatar_url FROM profile WHERE id = 1')
        .get() as { display_name: string; location: string; avatar_url: string | null }
      expect(game).toEqual({
        title: 'Portal',
        cover_url: 'https://images/portal.jpg',
        screenshots: '[]'
      })
      expect(profile).toEqual({ display_name: 'Galvik', location: '', avatar_url: null })
      expect(
        migrated.prepare('SELECT name FROM achievements WHERE game_id = 1').pluck().get()
      ).toBe('Sujeto de pruebas')
      expect(migrated.pragma('user_version', { simple: true })).toBe(8)
      migrated.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it.each([5, 6])(
    'queues all existing Steam metadata once when upgrading version %s',
    (version) => {
      const directory = mkdtempSync(join(tmpdir(), `gamevault-v${version}-`))
      const file = join(directory, 'library.db')
      try {
        const previous = openDatabase(file)
        previous.exec(`
        INSERT INTO games (source, catalog_id, title) VALUES ('steam', 21110, 'F.E.A.R.');
        INSERT INTO external_accounts (provider, external_user_id, display_name)
          VALUES ('steam', '76561198000000000', 'Jugador');
        INSERT INTO provider_ownerships
          (external_account_id, game_id, provider_game_id, provider_title, first_seen_at,
           last_seen_at, metadata_refreshed_at)
          VALUES (1, 1, '21110', 'F.E.A.R.: Extraction Point', '2026-09-06', '2026-09-06',
                  '2026-09-06');
        PRAGMA user_version = ${version};
      `)
        previous.close()

        const migrated = openDatabase(file)
        expect(
          migrated.prepare('SELECT metadata_refreshed_at FROM provider_ownerships').pluck().get()
        ).toBeNull()
        expect(migrated.pragma('user_version', { simple: true })).toBe(8)
        migrated.close()
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }
  )

  it('requeues unusable Steam cards and preserves existing local artwork on version 7 upgrade', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gamevault-v7-'))
    const file = join(directory, 'library.db')
    try {
      const previous = openDatabase(file)
      try {
        previous.exec(`
        INSERT INTO games (source, catalog_id, title)
          VALUES ('steam', 400, 'Portal');
        INSERT INTO games (source, catalog_id, title, description, cover_url)
          VALUES ('steam', 620, 'Portal 2', 'Descripción',
                  'gamevault-image://local/123e4567-e89b-42d3-a456-426614174000.jpg');
        INSERT INTO games (source, catalog_id, title, description, cover_url, background_url)
          VALUES ('steam', 730, 'Counter-Strike 2', 'Descripción',
                  'https://shared.akamai.steamstatic.com/steam/apps/730/header.jpg',
                  'https://shared.akamai.steamstatic.com/steam/apps/730/background.jpg');
        INSERT INTO games (source, catalog_id, title, description, cover_path)
          VALUES ('steam', 10, 'Counter-Strike', 'Descripción',
                  'gamevault-image://local/323e4567-e89b-42d3-a456-426614174000.jpg');
        INSERT INTO games (source, catalog_id, title, description, cover_url)
          VALUES ('steam', 20, '   ', 'Descripción',
                  'gamevault-image://local/423e4567-e89b-42d3-a456-426614174000.jpg');
        INSERT INTO external_accounts (provider, external_user_id, display_name)
          VALUES ('steam', '76561198000000000', 'Jugador');
        INSERT INTO provider_ownerships
          (external_account_id, game_id, provider_game_id, provider_title, first_seen_at,
           last_seen_at, metadata_refreshed_at)
          VALUES
            (1, 1, '400', 'Portal', '2026-09-06', '2026-09-06', '2026-09-06'),
            (1, 2, '620', 'Portal 2', '2026-09-06', '2026-09-06', '2026-09-06'),
            (1, 3, '730', 'Counter-Strike 2', '2026-09-06', '2026-09-06', '2026-09-06'),
            (1, 4, '10', 'Counter-Strike', '2026-09-06', '2026-09-06', '2026-09-06'),
            (1, 5, '20', 'Team Fortress Classic', '2026-09-06', '2026-09-06', '2026-09-06');
        ALTER TABLE games DROP COLUMN metadata_overrides;
        PRAGMA user_version = 7;
        `)
      } finally {
        previous.close()
      }

      const migrated = openDatabase(file)
      expect(
        migrated
          .prepare(
            'SELECT provider_game_id, metadata_refreshed_at FROM provider_ownerships ORDER BY id'
          )
          .all()
      ).toEqual([
        { provider_game_id: '400', metadata_refreshed_at: null },
        { provider_game_id: '620', metadata_refreshed_at: '2026-09-06' },
        { provider_game_id: '730', metadata_refreshed_at: null },
        { provider_game_id: '10', metadata_refreshed_at: '2026-09-06' },
        { provider_game_id: '20', metadata_refreshed_at: null }
      ])
      expect(
        migrated.prepare('SELECT metadata_overrides FROM games WHERE id = 2').pluck().get()
      ).toBe('["title","description","coverUrl"]')
      expect(
        migrated.prepare('SELECT metadata_overrides FROM games WHERE id = 3').pluck().get()
      ).toBe('["title","description"]')
      expect(
        migrated.prepare('SELECT cover_url, metadata_overrides FROM games WHERE id = 4').get()
      ).toEqual({
        cover_url: 'gamevault-image://local/323e4567-e89b-42d3-a456-426614174000.jpg',
        metadata_overrides: '["title","description","coverUrl"]'
      })
      migrated.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('creates the achievement schema for a fresh database with enforced ownership', () => {
    const db = openDatabase(':memory:')
    const gameId = db.prepare("INSERT INTO games (title) VALUES ('Celeste')").run().lastInsertRowid
    db.prepare("INSERT INTO achievements (game_id, name) VALUES (?, 'Primer paso')").run(gameId)

    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('user_version', { simple: true })).toBe(8)
    expect(db.prepare('SELECT name FROM achievements').pluck().get()).toBe('Primer paso')
    expect(() =>
      db.prepare("INSERT INTO achievements (game_id, name) VALUES (999, 'Huérfano')").run()
    ).toThrow()
    expect(() =>
      db
        .prepare(
          "INSERT INTO achievements (game_id, name, unlocked, unlocked_at) VALUES (?, 'Incoherente', 0, '2026-08-31')"
        )
        .run(gameId)
    ).toThrow()
    db.close()
  })

  it('preserves achievements and their cascade while adding the Steam source', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gamevault-intermediate-'))
    const file = join(directory, 'library.db')
    try {
      const intermediate = new Database(file)
      createIntermediateSchema(intermediate)
      intermediate.exec(`
        INSERT INTO games (title, source, catalog_id) VALUES ('Celeste', 'rawg', 26226);
        INSERT INTO achievements (game_id, name) VALUES (1, 'Forsaken');
      `)
      intermediate.close()

      const migrated = openDatabase(file)
      expect(migrated.prepare('SELECT name FROM achievements').pluck().get()).toBe('Forsaken')
      expect(
        migrated
          .prepare('SELECT "table" FROM pragma_foreign_key_list(\'achievements\')')
          .pluck()
          .get()
      ).toBe('games')
      migrated.prepare('DELETE FROM games WHERE id = 1').run()
      expect(migrated.prepare('SELECT COUNT(*) FROM achievements').pluck().get()).toBe(0)
      migrated.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('is idempotent after migration', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gamevault-idempotent-'))
    const file = join(directory, 'library.db')
    try {
      const first = openDatabase(file)
      first.exec("INSERT INTO games (title) VALUES ('Portal')")
      first.close()

      const second = openDatabase(file)
      expect(second.prepare('SELECT title FROM games').pluck().all()).toEqual(['Portal'])
      expect(second.pragma('user_version', { simple: true })).toBe(8)
      second.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('adds retained Steam unlock dates when upgrading schema version 3', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gamevault-v3-'))
    const file = join(directory, 'library.db')
    try {
      const previous = new Database(file)
      createIntermediateSchema(previous)
      previous.exec(`
        ALTER TABLE achievements ADD COLUMN provider TEXT;
        ALTER TABLE achievements ADD COLUMN provider_achievement_id TEXT;
        ALTER TABLE achievements ADD COLUMN provider_unlocked INTEGER;
        ALTER TABLE achievements ADD COLUMN manual_override INTEGER;
        INSERT INTO games (title) VALUES ('Portal');
        INSERT INTO achievements
          (game_id, name, unlocked, unlocked_at, provider, provider_achievement_id,
           provider_unlocked)
        VALUES (1, 'Sujeto de pruebas', 1, '2026-09-06', 'steam', 'TEST', 1);
        PRAGMA user_version = 3;
      `)
      previous.close()

      const migrated = openDatabase(file)
      expect(
        migrated.prepare('SELECT provider_unlocked, provider_unlocked_at FROM achievements').get()
      ).toEqual({ provider_unlocked: 1, provider_unlocked_at: '2026-09-06' })
      expect(migrated.pragma('user_version', { simple: true })).toBe(8)
      migrated.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('adds external accounts and ownerships without inferring ownership from catalog provenance', () => {
    const db = openDatabase(':memory:')
    db.prepare(
      "INSERT INTO games (source, catalog_id, title) VALUES ('steam', 400, 'Portal')"
    ).run()

    expect(db.prepare('SELECT COUNT(*) FROM provider_ownerships').pluck().get()).toBe(0)
    const accountId = db
      .prepare(
        "INSERT INTO external_accounts (provider, external_user_id, display_name) VALUES ('steam', ?, 'Jugador')"
      )
      .run('76561198000000000').lastInsertRowid
    db.prepare(
      `INSERT INTO provider_ownerships
       (external_account_id, game_id, provider_game_id, provider_title, first_seen_at, last_seen_at)
       VALUES (?, 1, '400', 'Portal', '2026-09-06', '2026-09-06')`
    ).run(accountId)

    expect(db.prepare('SELECT provider_game_id FROM provider_ownerships').pluck().get()).toBe('400')
    expect(() =>
      db
        .prepare(
          "INSERT INTO external_accounts (provider, external_user_id, display_name) VALUES ('steam', '2', 'Otro')"
        )
        .run()
    ).toThrow()
    db.close()
  })

  it('creates pending metadata state for existing version 4 Steam ownerships', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gamevault-v4-'))
    const file = join(directory, 'library.db')
    try {
      const previous = openDatabase(file)
      previous.exec(`
        INSERT INTO games (source, catalog_id, title) VALUES ('steam', 400, 'Portal');
        INSERT INTO external_accounts (provider, external_user_id, display_name)
          VALUES ('steam', '76561198000000000', 'Jugador');
        INSERT INTO provider_ownerships
          (external_account_id, game_id, provider_game_id, provider_title, first_seen_at, last_seen_at)
          VALUES (1, 1, '400', 'Portal', '2026-09-06', '2026-09-06');
        ALTER TABLE provider_ownerships DROP COLUMN metadata_refreshed_at;
        PRAGMA user_version = 4;
      `)
      previous.close()

      const migrated = openDatabase(file)
      expect(
        migrated.prepare('SELECT metadata_refreshed_at FROM provider_ownerships').pluck().get()
      ).toBeNull()
      expect(migrated.pragma('user_version', { simple: true })).toBe(8)
      migrated.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rolls back all schema changes when a late initialization step fails', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gamevault-rollback-'))
    const file = join(directory, 'library.db')
    try {
      const intermediate = new Database(file)
      createIntermediateSchema(intermediate)
      intermediate.exec(`
        INSERT INTO games (title, source, catalog_id) VALUES ('One', 'rawg', 7);
        INSERT INTO games (title, source, catalog_id) VALUES ('Two', 'rawg', 7);
      `)
      intermediate.close()

      expect(() => openDatabase(file)).toThrow()

      const unchanged = new Database(file)
      const tableSql = unchanged
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'games'")
        .pluck()
        .get() as string
      expect(tableSql).not.toContain("'steam'")
      expect(unchanged.prepare('SELECT COUNT(*) FROM games').pluck().get()).toBe(2)
      expect(unchanged.pragma('user_version', { simple: true })).toBe(0)
      unchanged.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
