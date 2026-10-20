import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTestDatabase } from '../db/test-db.js'
import { runMigrations } from '../db/migrations.js'
import {
  createUser,
  createRoute,
  createCategory,
  updateCategory,
  logSyncEntry,
  getUnsyncedEntries,
  createPanel,
  createExpense,
} from '../db/queries.js'
import type { Database } from '../db/interface.js'
import { createSyncEngine, type SyncStatus } from './sync-engine.js'
import { installFakeSyncServer } from './test-sync-server.js'
import { getStoredSyncCursor, type SyncPullEntry } from './api-client.js'

let db: Database
let userId: string
let routeId: string

beforeEach(async () => {
  db = createTestDatabase()
  await runMigrations(db)

  const user = await createUser(db, 'test@example.com', 'USD')
  userId = user.id
  const route = await createRoute(db, userId, 'personal')
  routeId = route.id

  localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function remoteCategoryEntry(id: string, serverTimestamp: string): SyncPullEntry {
  return {
    id: `entry-${id}`,
    table_name: 'categories',
    record_id: id,
    action: 'create',
    payload: JSON.stringify({
      id,
      route_id: routeId,
      name: `Remote ${id}`,
      color: '#ffffff',
      sort_order: 0,
      created_at: serverTimestamp,
      updated_at: serverTimestamp,
    }),
    local_timestamp: serverTimestamp,
    server_timestamp: serverTimestamp,
  }
}

async function countRows(table: string): Promise<number> {
  const rows = await db.query<{ n: number }>(`SELECT COUNT(*) as n FROM ${table}`)
  return rows[0].n
}

async function logExistingRows(table: string): Promise<void> {
  const rows = await db.query<Record<string, unknown>>(`SELECT * FROM ${table}`)
  for (const row of rows) {
    await logSyncEntry(db, userId, table, row.id as string, 'create', row)
  }
}

async function categoryIds(): Promise<string[]> {
  const rows = await db.query<{ id: string }>('SELECT id FROM categories ORDER BY id')
  return rows.map((r) => r.id)
}

describe('createSyncEngine', () => {
  it('initializes with correct status based on navigator.onLine', () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)

    // #when
    const engine = createSyncEngine(db)

    // #then
    expect(engine.getStatus()).toBe('local')
    engine.stop()
  })

  it('initializes as offline when not online', () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    // #when
    const engine = createSyncEngine(db)

    // #then
    expect(engine.getStatus()).toBe('offline')
    engine.stop()
  })

  it('notifies listeners on status change', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')
    const statuses: SyncStatus[] = []
    const engine = createSyncEngine(db)
    engine.onStatusChange((s) => statuses.push(s))

    const serverTs = new Date().toISOString()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ entries: [], server_timestamp: serverTs, has_more: false }), {
        status: 200,
      }),
    )

    // #when
    await engine.sync()

    // #then
    expect(statuses).toContain('synced')
    engine.stop()
  })

  it('starts with pending status when authenticated', () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')

    // #when
    const engine = createSyncEngine(db)

    // #then
    expect(engine.getStatus()).toBe('pending')
    engine.stop()
  })

  it('skips sync when no auth token is stored', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const engine = createSyncEngine(db)

    // #when
    await engine.sync()

    // #then
    expect(fetchSpy).not.toHaveBeenCalled()
    engine.stop()
  })

  it('pushes unsynced entries to server', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')

    await logSyncEntry(db, userId, 'expenses', 'exp-1', 'create', { amount: 1000 })

    const serverTs = new Date().toISOString()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, synced: 1, server_timestamp: serverTs }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ entries: [], server_timestamp: serverTs, has_more: false }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ entries: [], server_timestamp: serverTs, has_more: false }), {
          status: 200,
        }),
      )

    const engine = createSyncEngine(db)

    // #when
    await engine.sync()

    // #then — push + full pull (no stored cursor)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const pushCall = fetchSpy.mock.calls[0]
    expect(pushCall[0]).toContain('/sync/push')

    const remaining = await getUnsyncedEntries(db)
    expect(remaining).toHaveLength(0)
    engine.stop()
  })

  it('handles push failure gracefully', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')

    await logSyncEntry(db, userId, 'expenses', 'exp-1', 'create', { amount: 1000 })

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    )

    const engine = createSyncEngine(db)

    // #when
    await engine.sync()

    // #then
    expect(engine.getStatus()).toBe('pending')
    const remaining = await getUnsyncedEntries(db)
    expect(remaining).toHaveLength(1)
    engine.stop()
  })

  it('notifies dataListeners with all tables on stale cursor recovery', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')
    localStorage.setItem('pancakemaker_last_sync', '2025-01-01T00:00:00Z')

    const serverTs = new Date().toISOString()
    const remoteEntry = {
      id: 'remote-1',
      table_name: 'expenses',
      record_id: 'exp-remote',
      action: 'create',
      payload: JSON.stringify({
        id: 'exp-remote',
        panel_id: 'p1',
        category_id: 'c1',
        amount: 500,
        currency: 'USD',
        description: null,
        date: '2026-01-01',
        is_recurring: 0,
        recurrence_type: null,
        recurrence_end_date: null,
        recurrence_day: null,
        source_expense_id: null,
        created_at: serverTs,
        updated_at: serverTs,
        deleted_at: null,
      }),
      server_timestamp: serverTs,
    }

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ entries: [], server_timestamp: serverTs, has_more: false }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            entries: [remoteEntry],
            server_timestamp: serverTs,
            has_more: false,
          }),
          { status: 200 },
        ),
      )

    const engine = createSyncEngine(db)
    const receivedTables: Set<string>[] = []
    engine.onDataReceived((tables) => receivedTables.push(tables))

    // #when
    await engine.sync()

    // #then
    expect(receivedTables).toHaveLength(1)
    expect(receivedTables[0].has('expenses')).toBe(true)
    expect(receivedTables[0].has('users')).toBe(true)
    expect(receivedTables[0].has('panels')).toBe(true)
    engine.stop()
  })

  it('unsubscribes listeners correctly', () => {
    // #given
    const engine = createSyncEngine(db)
    const statuses: SyncStatus[] = []
    const unsubscribe = engine.onStatusChange((s) => statuses.push(s))

    // #when
    unsubscribe()

    // #then - changing status should not notify
    // (We can't directly trigger a status change without sync, but verify no error)
    expect(statuses).toHaveLength(0)
    engine.stop()
  })

  it('sets error status after 3 consecutive sync failures', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    )

    const engine = createSyncEngine(db)
    const statuses: SyncStatus[] = []
    engine.onStatusChange((s) => statuses.push(s))

    // #when
    await engine.sync()
    await engine.sync()
    await engine.sync()

    // #then
    expect(engine.getStatus()).toBe('error')
    engine.stop()
  })

  it('force sync resets circuit breaker and retries', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')

    const serverTs = new Date().toISOString()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    // fail 3 times to trip circuit breaker
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    )
    const engine = createSyncEngine(db)
    await engine.sync()
    await engine.sync()
    await engine.sync()
    expect(engine.getStatus()).toBe('error')

    // now server recovers
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ entries: [], server_timestamp: serverTs, has_more: false }), {
        status: 200,
      }),
    )

    // #when — force sync bypasses circuit breaker
    await engine.sync(true)

    // #then
    expect(engine.getStatus()).toBe('synced')
    engine.stop()
  })

  it('schedules periodic retry after successful sync', async () => {
    // #given
    vi.useFakeTimers()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')

    const serverTs = new Date().toISOString()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ entries: [], server_timestamp: serverTs, has_more: false }), {
        status: 200,
      }),
    )

    const engine = createSyncEngine(db)

    // #when — initial sync
    await engine.sync()
    expect(engine.getStatus()).toBe('synced')
    fetchSpy.mockClear()

    // advance past the sync interval (60s)
    await vi.advanceTimersByTimeAsync(61_000)

    // #then — should have called fetch again (another sync cycle)
    expect(fetchSpy).toHaveBeenCalled()

    engine.stop()
    vi.useRealTimers()
  })

  it('uses backoff for retry after failure', async () => {
    // #given
    vi.useFakeTimers()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }))

    const engine = createSyncEngine(db)

    // #when — first failure
    await engine.sync()
    fetchSpy.mockClear()

    // advance 4s — not yet time for retry (backoff is 5s)
    await vi.advanceTimersByTimeAsync(4_000)
    expect(fetchSpy).not.toHaveBeenCalled()

    // advance past 5s — should have retried
    await vi.advanceTimersByTimeAsync(2_000)
    expect(fetchSpy).toHaveBeenCalled()

    engine.stop()
    vi.useRealTimers()
  })

  it('stop cancels scheduled retry', async () => {
    // #given
    vi.useFakeTimers()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')

    const serverTs = new Date().toISOString()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ entries: [], server_timestamp: serverTs, has_more: false }), {
        status: 200,
      }),
    )

    const engine = createSyncEngine(db)
    await engine.sync()
    fetchSpy.mockClear()

    // #when
    engine.stop()
    await vi.advanceTimersByTimeAsync(120_000)

    // #then — no fetch calls after stop
    expect(fetchSpy).not.toHaveBeenCalled()

    vi.useRealTimers()
  })
})

describe('sync cursor', () => {
  it('receives a change another device pushed before this device pushes', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')
    localStorage.setItem('pancakemaker_last_sync', '2026-01-01T00:00:00.000Z|')
    const server = installFakeSyncServer({ pushTimestamp: '2026-01-03T00:00:00.000Z' })
    server.entries.push(remoteCategoryEntry('cat-remote', '2026-01-02T00:00:00.000Z'))
    await logSyncEntry(db, userId, 'tags', 'tag-1', 'delete', { id: 'tag-1' })
    const engine = createSyncEngine(db)

    // #when
    await engine.sync(true)
    engine.stop()

    // #then
    expect(await categoryIds()).toEqual(['cat-remote'])
  })

  it('applies every page when the server has more than one page', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')
    const server = installFakeSyncServer({ pageSize: 2 })
    server.entries.push(
      remoteCategoryEntry('cat-1', '2026-01-02T00:00:00.000Z'),
      remoteCategoryEntry('cat-2', '2026-01-02T00:00:00.000Z'),
      remoteCategoryEntry('cat-3', '2026-01-02T00:00:00.000Z'),
    )
    const engine = createSyncEngine(db)

    // #when
    await engine.sync(true)
    engine.stop()

    // #then
    expect(await categoryIds()).toEqual(['cat-1', 'cat-2', 'cat-3'])
  })

  it('stores the cursor of the last applied entry', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')
    const server = installFakeSyncServer()
    server.entries.push(remoteCategoryEntry('cat-1', '2026-01-02T00:00:00.000Z'))
    const engine = createSyncEngine(db)

    // #when
    await engine.sync(true)
    engine.stop()

    // #then
    expect(getStoredSyncCursor()).toBe('2026-01-02T00:00:00.000Z|entry-cat-1')
  })

  it('stops paging when a page leaves the cursor unchanged', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            entries: [remoteCategoryEntry('cat-1', '2026-01-02T00:00:00.000Z')],
            server_timestamp: '2026-01-05T00:00:00.000Z',
            has_more: true,
          }),
          { status: 200 },
        ),
    )
    const engine = createSyncEngine(db)

    // #when
    await engine.sync(true)
    engine.stop()

    // #then
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('leaves the cursor at the last applied page when a later page fails', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')
    const server = installFakeSyncServer({ pageSize: 2, failPullNumber: 2 })
    server.entries.push(
      remoteCategoryEntry('cat-1', '2026-01-02T00:00:00.000Z'),
      remoteCategoryEntry('cat-2', '2026-01-02T00:00:00.000Z'),
      remoteCategoryEntry('cat-3', '2026-01-02T00:00:00.000Z'),
    )
    const engine = createSyncEngine(db)

    // #when
    await engine.sync(true)
    engine.stop()

    // #then
    expect(getStoredSyncCursor()).toBe('2026-01-02T00:00:00.000Z|entry-cat-2')
  })

  it('keeps the data it just pushed on a first sign-in with no expenses', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')
    await createCategory(db, routeId, 'Food', '#ffffff', 0)
    await logExistingRows('users')
    await logExistingRows('routes')
    await logExistingRows('categories')
    installFakeSyncServer({ pushTimestamp: '2026-01-03T00:00:00.000Z' })
    const engine = createSyncEngine(db)

    // #when
    await engine.sync(true)
    engine.stop()

    // #then
    expect({
      routes: await countRows('routes'),
      categories: await countRows('categories'),
    }).toEqual({ routes: 1, categories: 1 })
  })

  it('keeps data it pushed on an earlier cycle when it has no expenses', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')
    localStorage.setItem('pancakemaker_last_sync', '2026-01-01T00:00:00.000Z|')
    await createCategory(db, routeId, 'Custom', '#ffffff', 0)
    await logExistingRows('users')
    await logExistingRows('routes')
    await logExistingRows('categories')
    installFakeSyncServer({ pushTimestamp: '2026-01-03T00:00:00.000Z' })
    const engine = createSyncEngine(db)
    await engine.sync(true)

    // #when
    await engine.sync(true)
    engine.stop()

    // #then
    expect(await countRows('categories')).toBe(1)
  })

  it("converges to the server's last write when another device edited the same record first", async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')
    localStorage.setItem('pancakemaker_last_sync', '2026-01-01T00:00:00.000Z|')
    const category = await createCategory(db, routeId, 'Original', '#ffffff', 0)
    const server = installFakeSyncServer({ pushTimestamp: '2026-01-03T00:00:00.000Z' })
    server.entries.push({
      id: 'entry-other-device',
      table_name: 'categories',
      record_id: category.id,
      action: 'update',
      payload: JSON.stringify({ id: category.id, name: 'FromOtherDevice' }),
      local_timestamp: '2026-01-02T00:00:00.000Z',
      server_timestamp: '2026-01-02T00:00:00.000Z',
    })
    await updateCategory(db, category.id, { name: 'ThisDevice' })
    await logSyncEntry(db, userId, 'categories', category.id, 'update', {
      id: category.id,
      name: 'ThisDevice',
    })
    const engine = createSyncEngine(db)

    // #when
    await engine.sync(true)
    engine.stop()

    // #then
    const rows = await db.query<{ name: string }>('SELECT name FROM categories WHERE id = ?', [
      category.id,
    ])
    expect(rows[0].name).toBe('ThisDevice')
  })

  it('pulls the full history when no cursor is stored', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')
    const category = await createCategory(db, routeId, 'Food', '#ffffff', 0)
    const panel = await createPanel(db, routeId, 'Daily', 'USD', 0, null, true)
    await createExpense(db, {
      panelId: panel.id,
      categoryId: category.id,
      amount: 100,
      currency: 'USD',
      date: '2026-01-01',
    })
    await logSyncEntry(db, userId, 'tags', 'tag-1', 'delete', { id: 'tag-1' })
    const server = installFakeSyncServer({ pushTimestamp: '2026-01-03T00:00:00.000Z' })
    server.entries.push(remoteCategoryEntry('cat-remote', '2026-01-02T00:00:00.000Z'))
    const engine = createSyncEngine(db)

    // #when
    await engine.sync(true)
    engine.stop()

    // #then
    expect(await categoryIds()).toContain('cat-remote')
  })

  it('keeps expenses when a pulled create replaces the category they reference', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')
    localStorage.setItem('pancakemaker_last_sync', '2026-01-01T00:00:00.000Z|')
    const category = await createCategory(db, routeId, 'Food', '#ffffff', 0)
    const panel = await createPanel(db, routeId, 'Daily', 'USD', 0, null, true)
    await createExpense(db, {
      panelId: panel.id,
      categoryId: category.id,
      amount: 100,
      currency: 'USD',
      date: '2026-01-01',
    })
    const server = installFakeSyncServer()
    server.entries.push({
      id: 'entry-replay',
      table_name: 'categories',
      record_id: category.id,
      action: 'create',
      payload: JSON.stringify({ ...category, name: 'Groceries' }),
      local_timestamp: '2026-01-02T00:00:00.000Z',
      server_timestamp: '2026-01-02T00:00:00.000Z',
    })
    const engine = createSyncEngine(db)

    // #when
    await engine.sync(true)
    engine.stop()

    // #then
    const rows = await db.query<{ name: string }>('SELECT name FROM categories WHERE id = ?', [
      category.id,
    ])
    expect({ name: rows[0].name, expenses: await countRows('expenses') }).toEqual({
      name: 'Groceries',
      expenses: 1,
    })
  })

  it('does not apply a page that starts at or before the stored cursor', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')
    localStorage.setItem('pancakemaker_last_sync', '2026-06-01T00:00:00.000Z|zzz')
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            entries: [
              remoteCategoryEntry('cat-1', '2026-01-02T00:00:00.000Z'),
              remoteCategoryEntry('cat-2', '2026-01-03T00:00:00.000Z'),
            ],
            server_timestamp: '2026-07-01T00:00:00.000Z',
            has_more: true,
          }),
          { status: 200 },
        ),
    )
    const engine = createSyncEngine(db)

    // #when
    await engine.sync(true)
    engine.stop()

    // #then
    expect({ cursor: getStoredSyncCursor(), categories: await categoryIds() }).toEqual({
      cursor: '2026-06-01T00:00:00.000Z|zzz',
      categories: [],
    })
  })
})
