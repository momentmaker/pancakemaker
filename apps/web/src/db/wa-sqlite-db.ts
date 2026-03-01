import SQLiteAsyncESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs'
import * as SQLite from 'wa-sqlite'
import type { Database, DatabaseRow } from './interface.js'

type WaSqliteParams = (number | string | Uint8Array | number[] | bigint | null)[]
type SqliteApi = ReturnType<typeof SQLite.Factory>

function createMutex() {
  let pending = Promise.resolve()
  return function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const result = pending.then(fn, fn)
    pending = result.then(
      () => {},
      () => {},
    )
    return result
  }
}

function buildDatabase(sqlite3: SqliteApi, db: number): Database {
  const serialize = createMutex()

  async function rawExecute(sql: string, params: unknown[] = []): Promise<void> {
    if (params.length === 0) {
      await sqlite3.exec(db, sql)
      return
    }
    const str = await sqlite3.statements(db, sql)
    for await (const stmt of str) {
      if (stmt === null) continue
      sqlite3.bind_collection(stmt, params as WaSqliteParams)
      while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
        // consume rows
      }
    }
  }

  async function rawQuery<T = DatabaseRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const results: T[] = []
    if (params.length === 0) {
      await sqlite3.exec(db, sql, (row: unknown[], columns: string[]) => {
        const obj: Record<string, unknown> = {}
        columns.forEach((col: string, i: number) => {
          obj[col] = row[i]
        })
        results.push(obj as T)
      })
      return results
    }

    const str = await sqlite3.statements(db, sql)
    for await (const stmt of str) {
      if (stmt === null) continue
      sqlite3.bind_collection(stmt, params as WaSqliteParams)
      const columns = sqlite3.column_names(stmt)
      while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
        const row = sqlite3.row(stmt)
        const obj: Record<string, unknown> = {}
        columns.forEach((col: string, i: number) => {
          obj[col] = row[i]
        })
        results.push(obj as T)
      }
    }
    return results
  }

  const self: Database = {
    execute: (sql, params) => serialize(() => rawExecute(sql, params)),
    query: <T = DatabaseRow>(sql: string, params?: unknown[]) =>
      serialize(() => rawQuery<T>(sql, params)),

    async transaction(fn: () => Promise<void>): Promise<void> {
      return serialize(async () => {
        const prev = { execute: self.execute, query: self.query }
        self.execute = rawExecute
        self.query = rawQuery
        await sqlite3.exec(db, 'BEGIN TRANSACTION')
        try {
          await fn()
          await sqlite3.exec(db, 'COMMIT')
        } catch (err) {
          await sqlite3.exec(db, 'ROLLBACK')
          throw err
        } finally {
          self.execute = prev.execute
          self.query = prev.query
        }
      })
    },
  }

  return self
}

export async function createInMemoryDatabase(name: string): Promise<Database> {
  const module = await SQLiteAsyncESMFactory({
    locateFile: (file: string) => `/${file}`,
  })
  const sqlite3 = SQLite.Factory(module)
  const db = await sqlite3.open_v2(name)
  await sqlite3.exec(db, 'PRAGMA foreign_keys=ON')
  return buildDatabase(sqlite3, db)
}

export async function createWaSqliteDatabase(
  name: string,
  idbStoreName = 'pancakemaker',
): Promise<Database> {
  const module = await SQLiteAsyncESMFactory({
    locateFile: (file: string) => `/${file}`,
  })
  const sqlite3 = SQLite.Factory(module)

  let db: number
  try {
    const { IDBBatchAtomicVFS } = await import('wa-sqlite/src/examples/IDBBatchAtomicVFS.js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- options param not in types
    const vfs = new (IDBBatchAtomicVFS as any)(idbStoreName, { purge: 'manual' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- VFS types don't extend SQLiteVFS
    sqlite3.vfs_register(vfs as any, false)
    db = await sqlite3.open_v2(name, undefined, idbStoreName)
  } catch (err) {
    console.warn('IDB VFS not available, using in-memory database:', err)
    db = await sqlite3.open_v2(name)
  }

  await sqlite3.exec(db, 'PRAGMA foreign_keys=ON')

  return buildDatabase(sqlite3, db)
}
