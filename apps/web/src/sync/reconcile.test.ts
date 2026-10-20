import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDatabase } from '../db/test-db.js'
import { runMigrations } from '../db/migrations.js'
import { seedDefaultData } from '../db/seed.js'
import {
  createCategory,
  createExpense,
  logSyncEntry,
  updateCategory,
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
  localStorage.clear()
  localStorage.setItem('pancakemaker_jwt', 'test-token')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mockServerPull(entryCount: number): void {
  const entries = Array.from({ length: entryCount }, (_, i) => ({
    id: `srv-${i}`,
    table_name: 'routes',
    record_id: `route-${i}`,
    action: 'create',
    payload: '{}',
    local_timestamp: '2026-01-01T00:00:00.000Z',
    server_timestamp: '2026-01-01T00:00:00.000Z',
  }))
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({ entries, server_timestamp: new Date().toISOString(), has_more: false }),
      { status: 200 },
    ),
  )
}

function mockServerPullFailure(): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
  )
}

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

  it('wipes seed data and creates server user when server account already has data (Path B)', async () => {
    // #given
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    mockServerPull(1)
    const serverUser = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'EUR' }

    // #when
    await reconcileAfterAuth(db, serverUser)

    // #then — only server user exists
    const users = await db.query<UserRow>('SELECT * FROM users')
    expect(users).toHaveLength(1)
    expect(users[0].id).toBe('server-user-id')
    expect(users[0].email).toBe('real@email.com')
    expect(users[0].base_currency).toBe('EUR')

    // #then — all seed data wiped (pull will repopulate)
    const routes = await db.query<RouteRow>('SELECT * FROM routes')
    expect(routes).toHaveLength(0)

    const categories = await db.query<{ id: string }>('SELECT * FROM categories')
    expect(categories).toHaveLength(0)

    const panels = await db.query<{ id: string }>('SELECT * FROM panels')
    expect(panels).toHaveLength(0)

    // #then — sync_log empty
    const syncEntries = await db.query<SyncLogRow>('SELECT * FROM sync_log')
    expect(syncEntries).toHaveLength(0)
  })

  it('keeps user-created data when device has unsynced changes but no expenses', async () => {
    // #given
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const category = await createCategory(db, seed.personalRouteId, 'Coffee', '#ff0000', 99)
    await logSyncEntry(db, seed.userId, 'categories', category.id, 'create', { id: category.id })
    const serverUser = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' }

    // #when
    await reconcileAfterAuth(db, serverUser)

    // #then
    const categories = await db.query<{ id: string }>('SELECT id FROM categories WHERE id = ?', [
      category.id,
    ])
    expect(categories).toHaveLength(1)
  })

  it('remaps unsynced changes to the server user when device has no expenses', async () => {
    // #given
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const category = await createCategory(db, seed.personalRouteId, 'Coffee', '#ff0000', 99)
    await logSyncEntry(db, seed.userId, 'categories', category.id, 'create', { id: category.id })
    const serverUser = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' }

    // #when
    await reconcileAfterAuth(db, serverUser)

    // #then
    const pending = await db.query<SyncLogRow>(
      'SELECT * FROM sync_log WHERE record_id = ? AND synced_at IS NULL',
      [category.id],
    )
    expect(pending.map((e) => e.user_id)).toEqual(['server-user-id'])
  })

  it('logs a create for a seeded category that only has a pending update', async () => {
    // #given
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const seeded = await db.query<{ id: string }>('SELECT id FROM categories LIMIT 1')
    const renamed = await updateCategory(db, seeded[0].id, { name: 'Groceries' })
    await logSyncEntry(
      db,
      seed.userId,
      'categories',
      seeded[0].id,
      'update',
      renamed as unknown as Record<string, unknown>,
    )
    const serverUser = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' }

    // #when
    await reconcileAfterAuth(db, serverUser)

    // #then
    const creates = await db.query<SyncLogRow>(
      "SELECT * FROM sync_log WHERE record_id = ? AND action = 'create'",
      [seeded[0].id],
    )
    expect(creates).toHaveLength(1)
  })

  it('queues seed data for push when device has only seed data and server account is empty', async () => {
    // #given
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    mockServerPull(0)
    const serverUser = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' }

    // #when
    await reconcileAfterAuth(db, serverUser)

    // #then
    const pending = await db.query<SyncLogRow>('SELECT * FROM sync_log WHERE synced_at IS NULL')
    expect(new Set(pending.map((e) => e.table_name))).toEqual(
      new Set(['users', 'routes', 'categories', 'panels']),
    )
  })

  it('rejects when the server data check fails', async () => {
    // #given
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    mockServerPullFailure()
    const serverUser = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' }

    // #when
    const result = reconcileAfterAuth(db, serverUser)

    // #then
    await expect(result).rejects.toThrow('Server error')
  })

  it('leaves local data untouched when the server data check fails', async () => {
    // #given
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    mockServerPullFailure()
    const serverUser = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' }

    // #when
    await reconcileAfterAuth(db, serverUser).catch(() => {})

    // #then
    const users = await db.query<UserRow>('SELECT * FROM users')
    expect(users.map((u) => u.id)).toEqual([seed.userId])
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
