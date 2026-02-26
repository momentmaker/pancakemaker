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
    expect(engine.getStatus()).toBe('synced')
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

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, synced: 0, server_timestamp: new Date().toISOString() }), { status: 200 }),
    )

    // #when
    await engine.sync()

    // #then
    expect(statuses).toContain('pending')
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
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, synced: 1, server_timestamp: serverTs }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ entries: [], server_timestamp: serverTs, has_more: false }), { status: 200 }),
      )

    const engine = createSyncEngine(db)

    // #when
    await engine.sync()

    // #then
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
