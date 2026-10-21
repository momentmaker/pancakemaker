import { MAX_PUSH_ENTRIES } from '@pancakemaker/shared'
import type { Database } from '../db/interface.js'
import { getUnsyncedEntries, markEntriesSynced, pruneOldSyncEntries } from '../db/queries.js'
import {
  pushEntries,
  pullEntries,
  getStoredToken,
  getStoredSyncCursor,
  storeSyncCursor,
  clearSyncCursor,
  cursorAfter,
  isAfterCursor,
  type SyncPullEntry,
} from './api-client.js'
import { TABLE_PRIORITY, applyEntries, yieldToMain } from './apply-entries.js'

export type SyncStatus = 'synced' | 'pending' | 'offline' | 'local' | 'error'

export interface SyncEngine {
  getStatus(): SyncStatus
  sync(force?: boolean): Promise<void>
  start(): void
  stop(): void
  onStatusChange(listener: (status: SyncStatus) => void): () => void
  onDataReceived(listener: (tables: Set<string>) => void): () => void
}

const MAX_CONSECUTIVE_FAILURES = 3
const SYNC_INTERVAL_MS = 60_000
const SYNC_CATCHUP_MS = 2_000
const BACKOFF_BASE_MS = 5_000

export function createSyncEngine(db: Database): SyncEngine {
  let status: SyncStatus = !navigator.onLine ? 'offline' : getStoredToken() ? 'pending' : 'local'
  let syncing = false
  let consecutiveFailures = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<(status: SyncStatus) => void>()
  const dataListeners = new Set<(tables: Set<string>) => void>()

  function setStatus(next: SyncStatus): void {
    if (next === status) return
    status = next
    for (const fn of listeners) fn(status)
  }

  async function push(): Promise<boolean> {
    const entries = await getUnsyncedEntries(db)
    console.log('[sync] push: %d unsynced entries', entries.length)
    if (entries.length === 0) return true

    for (let i = 0; i < entries.length; i += MAX_PUSH_ENTRIES) {
      const batch = entries.slice(i, i + MAX_PUSH_ENTRIES)
      const result = await pushEntries(
        batch.map((e) => ({
          id: e.id,
          table_name: e.table_name,
          record_id: e.record_id,
          action: e.action,
          payload: e.payload,
          local_timestamp: e.local_timestamp,
        })),
      )

      if (!result.success) {
        console.log('[sync] push failed:', result.error)
        return false
      }

      await markEntriesSynced(
        db,
        batch.map((e) => e.id),
      )
    }
    try {
      await pruneOldSyncEntries(db)
    } catch {
      // non-critical cleanup
    }
    return true
  }

  async function pull(): Promise<boolean> {
    let cursor = getStoredSyncCursor()
    console.log('[sync] pull: cursor=%s', cursor)
    let wipedLocalData = false

    let result = await pullEntries(cursor)
    if (!result.success) {
      console.log('[sync] pull failed:', result.error)
      return false
    }

    if (result.data.entries.length === 0 && cursor) {
      const expenses = await db.query<{ id: string }>(
        'SELECT id FROM expenses WHERE deleted_at IS NULL LIMIT 1',
      )
      if (expenses.length === 0) {
        console.log('[sync] stale cursor detected, retrying full pull')
        clearSyncCursor()
        cursor = null
        result = await pullEntries(null)
        if (!result.success) return false

        if (result.data.entries.length > 0) {
          console.log(
            '[sync] full pull got %d entries, wiping local seed data',
            result.data.entries.length,
          )
          wipedLocalData = true
          await db.execute('PRAGMA foreign_keys=OFF')
          try {
            await db.execute('DELETE FROM expense_tags')
            await db.execute('DELETE FROM recurring_templates')
            await db.execute('DELETE FROM expenses')
            await db.execute('DELETE FROM categories')
            await db.execute('DELETE FROM panels')
            await db.execute('DELETE FROM routes')
            await db.execute('DELETE FROM tags')
          } finally {
            await db.execute('PRAGMA foreign_keys=ON')
          }
        }
      }
    }

    let received = 0
    let applied = 0
    const appliedTables = new Set<string>()
    for (;;) {
      const { entries, has_more: hasMore } = result.data
      if (entries.length > 0 && !isAfterCursor(entries[0], cursor)) {
        console.log('[sync] pull: page starts at or before cursor %s, not applying it', cursor)
        return false
      }
      received += entries.length
      applied += await applyEntries(db, entries, appliedTables)

      const lastEntry = entries[entries.length - 1]
      const nextCursor = lastEntry ? cursorAfter(lastEntry) : cursor
      if (nextCursor && nextCursor !== cursor) storeSyncCursor(nextCursor)
      if (!hasMore || nextCursor === cursor) break

      cursor = nextCursor
      result = await pullEntries(cursor)
      if (!result.success) {
        console.log('[sync] pull failed:', result.error)
        return false
      }
    }

    console.log('[sync] pull: applied %d/%d entries', applied, received)

    if (applied > 0 || wipedLocalData) {
      await yieldToMain()
      const tables = wipedLocalData ? new Set(Object.keys(TABLE_PRIORITY)) : appliedTables
      for (const fn of dataListeners) fn(tables)
    }

    return true
  }

  function clearRetryTimer(): void {
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  function scheduleRetry(delayMs: number): void {
    clearRetryTimer()
    retryTimer = setTimeout(() => {
      retryTimer = null
      sync()
    }, delayMs)
  }

  async function sync(force?: boolean): Promise<void> {
    if (syncing) return
    if (!navigator.onLine) {
      setStatus('offline')
      return
    }
    if (!getStoredToken()) {
      setStatus('local')
      return
    }
    if (force) {
      consecutiveFailures = 0
      clearRetryTimer()
    }
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log(
        '[sync] circuit breaker open, skipping sync (%d consecutive failures)',
        consecutiveFailures,
      )
      setStatus('error')
      return
    }

    syncing = true
    setStatus('pending')
    console.log('[sync] starting sync cycle')

    try {
      const pushOk = await push()
      const pullOk = await pull()

      const remaining = await getUnsyncedEntries(db)
      if (!pushOk || !pullOk) {
        consecutiveFailures++
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          setStatus('error')
        } else {
          setStatus(navigator.onLine ? 'pending' : 'offline')
          scheduleRetry(BACKOFF_BASE_MS * Math.pow(2, consecutiveFailures - 1))
        }
      } else if (remaining.length > 0) {
        consecutiveFailures = 0
        setStatus('pending')
        scheduleRetry(SYNC_CATCHUP_MS)
      } else {
        consecutiveFailures = 0
        setStatus('synced')
        scheduleRetry(SYNC_INTERVAL_MS)
      }
    } catch {
      consecutiveFailures++
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        setStatus('error')
      } else {
        setStatus(navigator.onLine ? 'pending' : 'offline')
        scheduleRetry(BACKOFF_BASE_MS * Math.pow(2, consecutiveFailures - 1))
      }
    } finally {
      syncing = false
    }
  }

  function handleOffline(): void {
    clearRetryTimer()
    setStatus('offline')
  }

  function handleOnline(): void {
    if (status === 'offline') {
      clearRetryTimer()
      if (getStoredToken()) {
        consecutiveFailures = 0
        setStatus('pending')
        void sync()
      } else {
        setStatus('local')
      }
    }
  }

  function start(): void {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    if (getStoredToken() && navigator.onLine) void sync()
  }

  function stop(): void {
    clearRetryTimer()
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }

  function onStatusChange(listener: (s: SyncStatus) => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function onDataReceived(listener: (tables: Set<string>) => void): () => void {
    dataListeners.add(listener)
    return () => dataListeners.delete(listener)
  }

  return {
    getStatus: () => status,
    sync,
    start,
    stop,
    onStatusChange,
    onDataReceived,
  }
}
