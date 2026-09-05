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
      expect(migrated.pragma('user_version', { simple: true })).toBe(1)
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
    expect(db.pragma('user_version', { simple: true })).toBe(1)
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
      expect(second.pragma('user_version', { simple: true })).toBe(1)
      second.close()
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
