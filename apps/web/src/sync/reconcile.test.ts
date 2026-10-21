import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDatabase } from '../db/test-db.js'
import { runMigrations } from '../db/migrations.js'
import { seedDefaultData } from '../db/seed.js'
import {
  createCategory,
  createExpense,
  createPanel,
  getUnsyncedEntries,
  createTag,
  addTagToExpense,
  getRoutesByUser,
  logSyncEntry,
  updateCategory,
  type UserRow,
  type SyncLogRow,
  type RouteRow,
  type CategoryRow,
  type PanelRow,
} from '../db/queries.js'
import type { Database } from '../db/interface.js'
import { reconcileAfterAuth, AccountSwitchBlockedError } from './reconcile.js'
import { installFakeSyncServer, type FakeSyncServer } from './test-sync-server.js'
import { getStoredSyncCursor } from './api-client.js'

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

function mockEmptyAccount(): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({ entries: [], server_timestamp: new Date().toISOString(), has_more: false }),
      { status: 200 },
    ),
  )
}

function mockServerPullFailure(): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
  )
}

const SERVER_USER = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' }
const ACCOUNT_TIMESTAMP = '2026-01-02T00:00:00.000Z'

async function createAccount(
  server: FakeSyncServer,
  edit?: (accountDb: Database) => Promise<void>,
): Promise<Database> {
  const accountDb = createTestDatabase()
  await runMigrations(accountDb)
  await seedDefaultData(accountDb, 'local@pancakemaker.app', 'USD')
  await reconcileAfterAuth(accountDb, SERVER_USER)
  if (edit) await edit(accountDb)
  const pending = await getUnsyncedEntries(accountDb)
  server.entries.push(
    ...pending.map((e) => ({
      id: e.id,
      table_name: e.table_name,
      record_id: e.record_id,
      action: e.action,
      payload: e.payload,
      local_timestamp: e.local_timestamp,
      server_timestamp: ACCOUNT_TIMESTAMP,
    })),
  )
  return accountDb
}

async function idsIn(database: Database, table: string): Promise<string[]> {
  const rows = await database.query<{ id: string }>(`SELECT id FROM ${table} ORDER BY id`)
  return rows.map((r) => r.id)
}

async function routeId(database: Database, type: 'personal' | 'business'): Promise<string> {
  const rows = await database.query<{ id: string }>('SELECT id FROM routes WHERE type = ?', [type])
  return rows[0].id
}

async function categoryIn(
  database: Database,
  type: 'personal' | 'business',
  name: string,
): Promise<CategoryRow | undefined> {
  const rows = await database.query<CategoryRow>(
    'SELECT c.* FROM categories c JOIN routes r ON r.id = c.route_id WHERE r.type = ? AND c.name = ?',
    [type, name],
  )
  return rows[0]
}

async function panelIn(
  database: Database,
  type: 'personal' | 'business',
  name: string,
): Promise<PanelRow | undefined> {
  const rows = await database.query<PanelRow>(
    'SELECT p.* FROM panels p JOIN routes r ON r.id = p.route_id WHERE r.type = ? AND p.name = ?',
    [type, name],
  )
  return rows[0]
}

async function pendingFor(database: Database, recordId: string): Promise<string[]> {
  const rows = await database.query<{ action: string }>(
    'SELECT action FROM sync_log WHERE record_id = ? AND synced_at IS NULL',
    [recordId],
  )
  return rows.map((r) => r.action)
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

    mockEmptyAccount()

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

  it('keeps user-created data when device has unsynced changes but no expenses', async () => {
    // #given
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const category = await createCategory(db, seed.personalRouteId, 'Coffee', '#ff0000', 99)
    await logSyncEntry(db, seed.userId, 'categories', category.id, 'create', { id: category.id })
    const serverUser = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' }

    mockEmptyAccount()

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

    mockEmptyAccount()

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

    mockEmptyAccount()

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
    mockEmptyAccount()
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

describe('reconcileAfterAuth merging into an account with data', () => {
  it('ends with exactly the account routes, categories and panels for a seed-only device', async () => {
    // #given
    const server = installFakeSyncServer()
    const accountDb = await createAccount(server)
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const tables = ['routes', 'categories', 'panels']
    expect(await Promise.all(tables.map((t) => idsIn(db, t)))).toEqual(
      await Promise.all(tables.map((t) => idsIn(accountDb, t))),
    )
  })

  it('queues nothing for a seed-only device', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    expect(await getUnsyncedEntries(db)).toHaveLength(0)
  })

  it('repoints a device expense to the account category with the same name, ignoring case and spaces', async () => {
    // #given
    const server = installFakeSyncServer()
    const accountDb = await createAccount(server)
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const meals = (await categoryIn(db, 'personal', 'Meals'))!
    await updateCategory(db, meals.id, { name: '  MEALS ' })
    const expense = await createExpense(db, {
      panelId: (await panelIn(db, 'personal', 'Daily'))!.id,
      categoryId: meals.id,
      amount: 500,
      currency: 'USD',
      date: '2026-01-05',
    })

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const rows = await db.query<{ category_id: string }>(
      'SELECT category_id FROM expenses WHERE id = ?',
      [expense.id],
    )
    expect(rows[0].category_id).toBe((await categoryIn(accountDb, 'personal', 'Meals'))!.id)
  })

  it('repoints a device expense to the account panel with the same name and recurrence', async () => {
    // #given
    const server = installFakeSyncServer()
    const accountDb = await createAccount(server)
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const expense = await createExpense(db, {
      panelId: (await panelIn(db, 'personal', 'Daily'))!.id,
      categoryId: (await categoryIn(db, 'personal', 'Meals'))!.id,
      amount: 500,
      currency: 'USD',
      date: '2026-01-05',
    })

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const rows = await db.query<{ panel_id: string }>(
      'SELECT panel_id FROM expenses WHERE id = ?',
      [expense.id],
    )
    expect(rows[0].panel_id).toBe((await panelIn(accountDb, 'personal', 'Daily'))!.id)
  })

  it('keeps an in-use device category the account lacks under the account route and queues it', async () => {
    // #given
    const server = installFakeSyncServer()
    const accountDb = await createAccount(server)
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const coffee = await createCategory(db, seed.personalRouteId, 'Coffee', '#6b4f3a', 99)
    await createExpense(db, {
      panelId: (await panelIn(db, 'personal', 'Daily'))!.id,
      categoryId: coffee.id,
      amount: 300,
      currency: 'USD',
      date: '2026-01-05',
    })

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const rows = await db.query<{ route_id: string }>(
      'SELECT route_id FROM categories WHERE id = ?',
      [coffee.id],
    )
    expect({ routeId: rows[0]?.route_id, queued: await pendingFor(db, coffee.id) }).toEqual({
      routeId: await routeId(accountDb, 'personal'),
      queued: ['create'],
    })
  })

  it('drops an untouched device category the account no longer has', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server, async (accountDb) => {
      const meals = (await categoryIn(accountDb, 'personal', 'Meals'))!
      const renamed = await updateCategory(accountDb, meals.id, { name: 'Food' })
      await logSyncEntry(
        accountDb,
        SERVER_USER.id,
        'categories',
        meals.id,
        'update',
        renamed as unknown as Record<string, unknown>,
      )
    })
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    expect(await categoryIn(db, 'personal', 'Meals')).toBeUndefined()
  })

  it('clears is_default on a kept device panel', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const trips = await createPanel(db, seed.personalRouteId, 'Trips', 'USD', 9, null, true)
    await logSyncEntry(
      db,
      seed.userId,
      'panels',
      trips.id,
      'create',
      trips as unknown as Record<string, unknown>,
    )

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const rows = await db.query<{ is_default: number }>(
      'SELECT is_default FROM panels WHERE id = ?',
      [trips.id],
    )
    expect(rows[0].is_default).toBe(0)
  })

  it('does not queue deletes made before sign-in', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const health = (await categoryIn(db, 'personal', 'Health'))!
    await db.execute('DELETE FROM categories WHERE id = ?', [health.id])
    await logSyncEntry(db, seed.userId, 'categories', health.id, 'delete', { id: health.id })

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const deletes = await db.query<{ id: string }>(
      "SELECT id FROM sync_log WHERE action = 'delete' AND synced_at IS NULL",
    )
    expect(deletes).toHaveLength(0)
  })

  it('queues deleted device expenses too', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const expense = await createExpense(db, {
      panelId: (await panelIn(db, 'personal', 'Daily'))!.id,
      categoryId: (await categoryIn(db, 'personal', 'Meals'))!.id,
      amount: 500,
      currency: 'USD',
      date: '2026-01-05',
    })
    await db.execute('UPDATE expenses SET deleted_at = ? WHERE id = ?', [
      '2026-01-06T00:00:00.000Z',
      expense.id,
    ])

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    expect(await pendingFor(db, expense.id)).toEqual(['create'])
  })

  it('stores the cursor of the last account entry', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const lastId = server.entries
      .map((e) => e.id)
      .sort()
      .at(-1)

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    expect(getStoredSyncCursor()).toBe(`${ACCOUNT_TIMESTAMP}|${lastId}`)
  })

  it('keeps the device route and its categories when the account lacks that route type', async () => {
    // #given
    const server = installFakeSyncServer()
    const accountDb = await createAccount(server)
    const businessRouteId = await routeId(accountDb, 'business')
    const businessRows = await accountDb.query<{ id: string }>(
      'SELECT id FROM categories WHERE route_id = ? UNION SELECT id FROM panels WHERE route_id = ?',
      [businessRouteId, businessRouteId],
    )
    const dropped = new Set([businessRouteId, ...businessRows.map((r) => r.id)])
    server.entries = server.entries.filter((e) => !dropped.has(e.record_id))
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const deviceBusinessCategories = await db.query<{ id: string }>(
      'SELECT id FROM categories WHERE route_id = ?',
      [seed.businessRouteId],
    )

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const kept = await db.query<{ id: string }>('SELECT id FROM categories WHERE route_id = ?', [
      seed.businessRouteId,
    ])
    expect({
      categories: kept.length,
      routeQueued: await pendingFor(db, seed.businessRouteId),
    }).toEqual({ categories: deviceBusinessCategories.length, routeQueued: ['create'] })
  })

  it('leaves the device untouched when the merge fails', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const categoriesBefore = await idsIn(db, 'categories')
    const execute = db.execute.bind(db)
    vi.spyOn(db, 'execute').mockImplementation(async (sql, params) => {
      if (sql.startsWith('DELETE FROM routes')) throw new Error('boom')
      return execute(sql, params)
    })

    // #when
    await reconcileAfterAuth(db, SERVER_USER).catch(() => {})

    // #then
    vi.restoreAllMocks()
    expect({ users: await idsIn(db, 'users'), categories: await idsIn(db, 'categories') }).toEqual({
      users: [seed.userId],
      categories: categoriesBefore,
    })
  })

  it('repoints expense tags to the account tag with the same name', async () => {
    // #given
    const server = installFakeSyncServer()
    let accountTagId = ''
    await createAccount(server, async (accountDb) => {
      const tag = await createTag(accountDb, SERVER_USER.id, 'Trip')
      accountTagId = tag.id
      await logSyncEntry(
        accountDb,
        SERVER_USER.id,
        'tags',
        tag.id,
        'create',
        tag as unknown as Record<string, unknown>,
      )
    })
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const deviceTag = await createTag(db, seed.userId, ' trip')
    const expense = await createExpense(db, {
      panelId: (await panelIn(db, 'personal', 'Daily'))!.id,
      categoryId: (await categoryIn(db, 'personal', 'Meals'))!.id,
      amount: 500,
      currency: 'USD',
      date: '2026-01-05',
    })
    await addTagToExpense(db, expense.id, deviceTag.id)

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const rows = await db.query<{ tag_id: string }>(
      'SELECT tag_id FROM expense_tags WHERE expense_id = ?',
      [expense.id],
    )
    expect(rows.map((r) => r.tag_id)).toEqual([accountTagId])
  })

  it('queues a create for a device tag the account lacks', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const tag = await createTag(db, seed.userId, 'Solo')

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    expect(await pendingFor(db, tag.id)).toEqual(['create'])
  })

  it('merges when the device user already has the account email', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    await db.execute('UPDATE users SET email = ? WHERE id = ?', [SERVER_USER.email, seed.userId])

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    expect(await idsIn(db, 'users')).toEqual([SERVER_USER.id])
  })

  it('maps device rows to the oldest account route of a type', async () => {
    // #given
    const server = installFakeSyncServer()
    const accountDb = await createAccount(server)
    const duplicateRoute = {
      id: 'route-duplicate',
      user_id: SERVER_USER.id,
      type: 'personal',
      created_at: '2099-01-01T00:00:00.000Z',
      updated_at: '2099-01-01T00:00:00.000Z',
    }
    server.entries.push({
      id: '9999999999999-000000-duplicate-route',
      table_name: 'routes',
      record_id: duplicateRoute.id,
      action: 'create',
      payload: JSON.stringify(duplicateRoute),
      local_timestamp: ACCOUNT_TIMESTAMP,
      server_timestamp: ACCOUNT_TIMESTAMP,
    })
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const expense = await createExpense(db, {
      panelId: (await panelIn(db, 'personal', 'Daily'))!.id,
      categoryId: (await categoryIn(db, 'personal', 'Meals'))!.id,
      amount: 500,
      currency: 'USD',
      date: '2026-01-05',
    })

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const rows = await db.query<{ category_id: string }>(
      'SELECT category_id FROM expenses WHERE id = ?',
      [expense.id],
    )
    expect(rows[0].category_id).toBe((await categoryIn(accountDb, 'personal', 'Meals'))!.id)
  })

  it('merges even when an account entry fails to apply', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    server.entries.push({
      id: '9999999999999-000000-broken-expense',
      table_name: 'expenses',
      record_id: 'exp-broken',
      action: 'create',
      payload: JSON.stringify({
        id: 'exp-broken',
        panel_id: 'missing-panel',
        category_id: 'missing-category',
        amount: 1,
        currency: 'USD',
        date: '2026-01-02',
        is_recurring: 0,
        created_at: ACCOUNT_TIMESTAMP,
        updated_at: ACCOUNT_TIMESTAMP,
      }),
      local_timestamp: ACCOUNT_TIMESTAMP,
      server_timestamp: ACCOUNT_TIMESTAMP,
    })
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    expect(await idsIn(db, 'users')).toEqual([SERVER_USER.id])
  })

  it('shows the route device rows were merged into when the account has an older duplicate', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    const olderDuplicate = {
      id: 'route-older-duplicate',
      user_id: SERVER_USER.id,
      type: 'personal',
      created_at: '2000-01-01T00:00:00.000Z',
      updated_at: '2000-01-01T00:00:00.000Z',
    }
    server.entries.push({
      id: '9999999999999-000000-older-duplicate-route',
      table_name: 'routes',
      record_id: olderDuplicate.id,
      action: 'create',
      payload: JSON.stringify(olderDuplicate),
      local_timestamp: ACCOUNT_TIMESTAMP,
      server_timestamp: ACCOUNT_TIMESTAMP,
    })
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const coffee = await createCategory(db, seed.personalRouteId, 'Coffee', '#6b4f3a', 99)
    await createExpense(db, {
      panelId: (await panelIn(db, 'personal', 'Daily'))!.id,
      categoryId: coffee.id,
      amount: 300,
      currency: 'USD',
      date: '2026-01-05',
    })

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const shown = (await getRoutesByUser(db, SERVER_USER.id)).find((r) => r.type === 'personal')
    const coffeeRows = await db.query<{ route_id: string }>(
      'SELECT route_id FROM categories WHERE id = ?',
      [coffee.id],
    )
    expect(shown?.id).toBe(coffeeRows[0].route_id)
  })
})

describe('reconcileAfterAuth switching accounts', () => {
  async function deviceOfPreviousAccount(): Promise<{ expenseId: string }> {
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    await db.execute("UPDATE users SET email = 'previous@email.com'")
    const expense = await createExpense(db, {
      panelId: (await panelIn(db, 'personal', 'Daily'))!.id,
      categoryId: (await categoryIn(db, 'personal', 'Meals'))!.id,
      amount: 900,
      currency: 'USD',
      date: '2026-01-05',
    })
    return { expenseId: expense.id }
  }

  it("does not queue the previous account's expenses into an account with data", async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    const { expenseId } = await deviceOfPreviousAccount()

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    expect(await pendingFor(db, expenseId)).toEqual([])
  })

  it("does not keep the previous account's expenses when switching to an empty account", async () => {
    // #given
    installFakeSyncServer()
    await deviceOfPreviousAccount()

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    expect(await idsIn(db, 'expenses')).toEqual([])
  })

  it('refuses to switch while the previous account has unsynced changes', async () => {
    // #given
    installFakeSyncServer()
    const { expenseId } = await deviceOfPreviousAccount()
    const users = await db.query<UserRow>('SELECT * FROM users')
    await logSyncEntry(db, users[0].id, 'expenses', expenseId, 'create', { id: expenseId })

    // #when
    const result = reconcileAfterAuth(db, SERVER_USER)

    // #then
    await expect(result).rejects.toBeInstanceOf(AccountSwitchBlockedError)
  })

  it("keeps the previous account's unsynced changes when it refuses to switch", async () => {
    // #given
    installFakeSyncServer()
    const { expenseId } = await deviceOfPreviousAccount()
    const users = await db.query<UserRow>('SELECT * FROM users')
    await logSyncEntry(db, users[0].id, 'expenses', expenseId, 'create', { id: expenseId })

    // #when
    await reconcileAfterAuth(db, SERVER_USER).catch(() => {})

    // #then
    expect(await pendingFor(db, expenseId)).toEqual(['create'])
  })
})
