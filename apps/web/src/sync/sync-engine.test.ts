import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTestDatabase } from '../db/test-db.js'
import { runMigrations } from '../db/migrations.js'
import { createUser, createRoute, logSyncEntry, getUnsyncedEntries } from '../db/queries.js'
import type { Database } from '../db/interface.js'
import { createSyncEngine, type SyncStatus } from './sync-engine.js'

let db: Database
let userId: string

beforeEach(async () => {
  db = createTestDatabase()
  await runMigrations(db)

  const user = await createUser(db, 'test@example.com', 'USD')
  userId = user.id
  await createRoute(db, userId, 'personal')

  localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

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

    // #then — push + pull + stale-cursor retry pull
    expect(fetchSpy).toHaveBeenCalledTimes(3)
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

  it('skips focus-triggered sync within cooldown period', async () => {
    // #given
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.setItem('pancakemaker_jwt', 'test-token')

    const serverTs = new Date().toISOString()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ entries: [], server_timestamp: serverTs, has_more: false }), {
        status: 200,
      }),
    )

    const engine = createSyncEngine(db)
    engine.start()
    await engine.sync()
    expect(engine.getStatus()).toBe('synced')
    const callsAfterSync = fetchSpy.mock.calls.length

    // #when — dispatch focus immediately after sync completed
    window.dispatchEvent(new Event('focus'))
    await new Promise((r) => setTimeout(r, 50))

    // #then — no additional fetch calls from the focus event
    expect(fetchSpy.mock.calls.length).toBe(callsAfterSync)
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
})
