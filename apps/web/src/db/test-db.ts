import BetterSqlite3 from 'better-sqlite3'
import type { Database, DatabaseRow } from './interface.js'

export function createTestDatabase(): Database {
  const sqlite = new BetterSqlite3(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  return {
    async execute(sql: string, params: unknown[] = []): Promise<void> {
      if (params.length === 0) {
        sqlite.exec(sql)
        return
      }
      sqlite.prepare(sql).run(...params)
    },

    async query<T = DatabaseRow>(sql: string, params: unknown[] = []): Promise<T[]> {
      return sqlite.prepare(sql).all(...params) as T[]
    },

    async transaction(fn: () => Promise<void>): Promise<void> {
      sqlite.exec('BEGIN TRANSACTION')
      try {
        await fn()
        sqlite.exec('COMMIT')
      } catch (err) {
        sqlite.exec('ROLLBACK')
        throw err
      }
    },
  }
}
