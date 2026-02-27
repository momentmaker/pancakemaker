import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from '../db/test-db.js'
import { runMigrations } from '../db/migrations.js'
import { seedDefaultData } from '../db/seed.js'
import {
  createExpense,
  logSyncEntry,
  type UserRow,
  type SyncLogRow,
  type RouteRow,
} from '../db/queries.js'
import type { Database } from '../db/interface.js'
import { reconcileAfterAuth } from './reconcile.js'

let db: Database

beforeEach(async () => {
  db = createTestDatabase()
  await runMigrations(db)
})

describe('reconcileAfterAuth', () => {
  it('no-ops when local userId matches server userId', async () => {
    // #given
    const seed = await seedDefaultData(db, 'user@test.com', 'USD')
    const serverUser = { id: seed.userId, email: 'user@test.com', baseCurrency: 'USD' }

    // #when
    await reconcileAfterAuth(db, serverUser)

    // #then
    const users = await db.query<UserRow>('SELECT * FROM users')
    expect(users).toHaveLength(1)
    expect(users[0].id).toBe(seed.userId)
  })

  it('remaps user ID and logs seed data when device has expenses (Path A)', async () => {
    // #given
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const localUserId = seed.userId

    const categories = await db.query<{ id: string }>('SELECT id FROM categories LIMIT 1')
    const panels = await db.query<{ id: string }>('SELECT id FROM panels LIMIT 1')
    await createExpense(db, {
      panelId: panels[0].id,
      categoryId: categories[0].id,
      amount: 5000,
      currency: 'USD',
      date: '2026-02-01',
    })
    await logSyncEntry(db, localUserId, 'expenses', 'exp-1', 'create', { amount: 5000 })

    const serverUser = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' }

    // #when
    await reconcileAfterAuth(db, serverUser)

    // #then — user ID remapped
    const users = await db.query<UserRow>('SELECT * FROM users')
    expect(users).toHaveLength(1)
    expect(users[0].id).toBe('server-user-id')
    expect(users[0].email).toBe('real@email.com')

    // #then — routes reference new user ID
    const routes = await db.query<RouteRow>('SELECT * FROM routes')
    expect(routes.length).toBeGreaterThan(0)
    for (const route of routes) {
      expect(route.user_id).toBe('server-user-id')
    }

    // #then — expenses preserved
    const expenses = await db.query<{ id: string }>(
      'SELECT id FROM expenses WHERE deleted_at IS NULL',
    )
    expect(expenses).toHaveLength(1)

    // #then — seed data logged to sync_log
    const syncEntries = await db.query<SyncLogRow>('SELECT * FROM sync_log WHERE synced_at IS NULL')
    const tables = new Set(syncEntries.map((e) => e.table_name))
    expect(tables).toContain('users')
    expect(tables).toContain('routes')
    expect(tables).toContain('categories')
    expect(tables).toContain('panels')

    // #then — all sync_log entries use new user ID
    for (const entry of syncEntries) {
      expect(entry.user_id).toBe('server-user-id')
    }
  })

  it('remaps user ID and clears sync_log when no expenses (Path B)', async () => {
    // #given
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const serverUser = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'EUR' }

    // #when
    await reconcileAfterAuth(db, serverUser)

    // #then — user remapped with server details
    const users = await db.query<UserRow>('SELECT * FROM users')
    expect(users).toHaveLength(1)
    expect(users[0].id).toBe('server-user-id')
    expect(users[0].email).toBe('real@email.com')
    expect(users[0].base_currency).toBe('EUR')

    // #then — seed data preserved with remapped user ID
    const routes = await db.query<RouteRow>('SELECT * FROM routes')
    expect(routes).toHaveLength(2)
    for (const route of routes) {
      expect(route.user_id).toBe('server-user-id')
    }

    const categories = await db.query<{ id: string }>('SELECT * FROM categories')
    expect(categories.length).toBeGreaterThan(0)

    const panels = await db.query<{ id: string }>('SELECT * FROM panels')
    expect(panels.length).toBeGreaterThan(0)

    // #then — sync_log empty (seed data not pushed)
    const syncEntries = await db.query<SyncLogRow>('SELECT * FROM sync_log')
    expect(syncEntries).toHaveLength(0)
  })

  it('no-ops when no local user exists', async () => {
    // #given — empty database, no seed
    const serverUser = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' }

    // #when
    await reconcileAfterAuth(db, serverUser)

    // #then — no users created
    const users = await db.query<UserRow>('SELECT * FROM users')
    expect(users).toHaveLength(0)
  })
})
