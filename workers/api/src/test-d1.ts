import { readFileSync } from 'node:fs'
import BetterSqlite3 from 'better-sqlite3'

export interface TestD1 {
  db: D1Database
  insertSyncEntry(entry: { id: string; user_id: string; server_timestamp: string }): void
}

export function createTestD1(): TestD1 {
  const sqlite = new BetterSqlite3(':memory:')
  sqlite.exec(
    readFileSync(new URL('../migrations/0001_initial_schema.sql', import.meta.url), 'utf8'),
  )

  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql)
      return {
        bind: (...params: unknown[]) => ({
          all: async () => ({ results: statement.all(...params) }),
        }),
      }
    },
  } as unknown as D1Database

  const insert = sqlite.prepare(
    `INSERT INTO sync_log (id, user_id, table_name, record_id, action, payload, local_timestamp, server_timestamp, synced_at)
     VALUES (?, ?, 'expenses', ?, 'create', '{}', ?, ?, ?)`,
  )

  return {
    db,
    insertSyncEntry: ({ id, user_id, server_timestamp }) => {
      insert.run(id, user_id, id, server_timestamp, server_timestamp, server_timestamp)
    },
  }
}
