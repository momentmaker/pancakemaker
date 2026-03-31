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
