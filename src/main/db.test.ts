import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { openDatabase } from './db'

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
      migrated.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
