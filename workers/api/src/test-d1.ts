import { readdirSync, readFileSync } from 'node:fs'
import BetterSqlite3 from 'better-sqlite3'

export interface TestD1 {
  db: D1Database
  insertSyncEntry(entry: { id: string; user_id: string; server_timestamp: string }): void
  insertAuthToken(token: { id: string; email: string; token: string }): void
}

export function createTestD1(): TestD1 {
  const sqlite = new BetterSqlite3(':memory:')
  const migrationsDir = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(migrationsDir).sort()) {
    if (file.endsWith('.sql')) sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'))
  }

  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql)
      return {
        bind: (...params: unknown[]) => ({
          all: async () => ({ results: statement.all(...params) }),
          first: async () => statement.get(...params) ?? null,
          run: async () => {
            statement.run(...params)
            return { success: true }
          },
        }),
      }
    },
  } as unknown as D1Database

  const insertSync = sqlite.prepare(
    `INSERT INTO sync_log (id, user_id, table_name, record_id, action, payload, local_timestamp, server_timestamp, synced_at)
     VALUES (?, ?, 'expenses', ?, 'create', '{}', ?, ?, ?)`,
  )
  const insertToken = sqlite.prepare(
    `INSERT INTO auth_tokens (id, email, token, code, expires_at, created_at)
     VALUES (?, ?, ?, NULL, '2099-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  )

  return {
    db,
    insertSyncEntry: ({ id, user_id, server_timestamp }) => {
      insertSync.run(id, user_id, id, server_timestamp, server_timestamp, server_timestamp)
    },
    insertAuthToken: ({ id, email, token }) => {
      insertToken.run(id, email, token)
    },
  }
}
