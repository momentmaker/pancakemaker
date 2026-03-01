import type { Database } from '../db/interface.js'
import {
  getUnsyncedEntries,
  markEntriesSynced,
  getLastSyncTimestamp,
  pruneOldSyncEntries,
} from '../db/queries.js'
import {
  pushEntries,
  pullEntries,
  getStoredToken,
  getStoredSyncCursor,
  storeSyncCursor,
  clearSyncCursor,
  type SyncPullEntry,
} from './api-client.js'

export type SyncStatus = 'synced' | 'pending' | 'offline' | 'local'

export interface SyncEngine {
  getStatus(): SyncStatus
  sync(): Promise<void>
  start(): void
  stop(): void
  onStatusChange(listener: (status: SyncStatus) => void): () => void
  onDataReceived(listener: (tables: Set<string>) => void): () => void
}

const SYNC_INTERVAL_MS = 5 * 60 * 1000
const FOCUS_COOLDOWN_MS = 30_000
const INITIAL_SYNC_DELAY_MS = 3_000
const CRASH_WINDOW_MS = 60_000
const CRASH_SENTINEL_KEY = 'pancakemaker_sync_boot'
const MAX_CONSECUTIVE_FAILURES = 3

function detectCrashLoop(): boolean {
  const prev = localStorage.getItem(CRASH_SENTINEL_KEY)
  const now = Date.now()
  localStorage.setItem(CRASH_SENTINEL_KEY, String(now))
  if (!prev) return false
  return now - Number(prev) < CRASH_WINDOW_MS
}

function clearCrashSentinel(): void {
  localStorage.removeItem(CRASH_SENTINEL_KEY)
}

const TABLE_PRIORITY: Record<string, number> = {
  users: 0,
  routes: 1,
  categories: 2,
  panels: 3,
  tags: 4,
  recurring_templates: 5,
  expenses: 6,
  expense_tags: 7,
}

export function createSyncEngine(db: Database): SyncEngine {
  let status: SyncStatus = !navigator.onLine ? 'offline' : getStoredToken() ? 'pending' : 'local'
  let intervalId: ReturnType<typeof setInterval> | null = null
  let initialDelayId: ReturnType<typeof setTimeout> | null = null
  let syncing = false
  let lastSyncCompletedAt = 0
  let consecutiveFailures = 0
  let syncDisabled = false
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

    const result = await pushEntries(
      entries.map((e) => ({
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
      entries.map((e) => e.id),
    )
    try {
      await pruneOldSyncEntries(db)
    } catch {
      // non-critical cleanup
    }
    storeSyncCursor(result.data.server_timestamp)
    return true
  }

  async function applyRemoteEntry(entry: SyncPullEntry): Promise<void> {
    const payload = JSON.parse(entry.payload) as Record<string, unknown>
    const table = entry.table_name

    if (entry.action === 'create') {
      const cols = Object.keys(payload)
      const placeholders = cols.map(() => '?').join(', ')
      await db.execute(
        `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
        cols.map((k) => payload[k] as unknown),
      )
    } else if (entry.action === 'update') {
      const { id, ...rest } = payload
      const sets = Object.keys(rest)
        .map((k) => `${k} = ?`)
        .join(', ')
      if (sets && id) {
        await db.execute(`UPDATE ${table} SET ${sets} WHERE id = ?`, [...Object.values(rest), id])
      }
    } else if (entry.action === 'delete') {
      if (table === 'expenses') {
        await db.execute('UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?', [
          new Date().toISOString(),
          new Date().toISOString(),
          entry.record_id,
        ])
      } else {
        await db.execute(`DELETE FROM ${table} WHERE id = ?`, [entry.record_id])
      }
    }
  }

  async function pull(): Promise<boolean> {
    const cursor = getStoredSyncCursor() ?? (await getLastSyncTimestamp(db))
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
            await db.transaction(async () => {
              await db.execute('DELETE FROM expense_tags')
              await db.execute('DELETE FROM recurring_templates')
              await db.execute('DELETE FROM expenses')
              await db.execute('DELETE FROM categories')
              await db.execute('DELETE FROM panels')
              await db.execute('DELETE FROM routes')
              await db.execute('DELETE FROM tags')
            })
          } finally {
            await db.execute('PRAGMA foreign_keys=ON')
          }
        }
      }
    }

    console.log('[sync] pull: received %d entries', result.data.entries.length)

    const sorted = [...result.data.entries].sort((a, b) => {
      const pa = TABLE_PRIORITY[a.table_name] ?? 99
      const pb = TABLE_PRIORITY[b.table_name] ?? 99
      return pa - pb
    })

    let applied = 0
    const appliedTables = new Set<string>()
    await db.transaction(async () => {
      for (const entry of sorted) {
        try {
          await applyRemoteEntry(entry)
          applied++
          appliedTables.add(entry.table_name)
        } catch (err) {
          console.log(
            '[sync] apply failed: table=%s action=%s id=%s',
            entry.table_name,
            entry.action,
            entry.record_id,
            err,
          )
        }
      }
    })

    console.log('[sync] pull: applied %d/%d entries', applied, sorted.length)

    if (result.data.entries.length > 0) {
      storeSyncCursor(result.data.server_timestamp)
      if (applied > 0 || wipedLocalData) {
        const tables = wipedLocalData ? new Set(Object.keys(TABLE_PRIORITY)) : appliedTables
        for (const fn of dataListeners) fn(tables)
      }
    }

    return true
  }

  async function sync(): Promise<void> {
    if (syncing || syncDisabled) return
    if (!navigator.onLine) {
      setStatus('offline')
      return
    }
    if (!getStoredToken()) {
      setStatus('local')
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
        setStatus(navigator.onLine ? 'pending' : 'offline')
      } else if (remaining.length > 0) {
        consecutiveFailures = 0
        setStatus('pending')
      } else {
        consecutiveFailures = 0
        clearCrashSentinel()
        setStatus('synced')
      }
    } catch {
      consecutiveFailures++
      setStatus(navigator.onLine ? 'pending' : 'offline')
    } finally {
      syncing = false
      lastSyncCompletedAt = Date.now()
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log('[sync] too many consecutive failures, disabling sync for this session')
        syncDisabled = true
      }
    }
  }

  function handleOnline(): void {
    sync()
  }

  function handleOffline(): void {
    setStatus('offline')
  }

  function handleFocus(): void {
    if (navigator.onLine && Date.now() - lastSyncCompletedAt >= FOCUS_COOLDOWN_MS) sync()
  }

  function start(): void {
    if (detectCrashLoop()) {
      console.log('[sync] crash loop detected, disabling sync for this session')
      syncDisabled = true
      setStatus(getStoredToken() ? 'pending' : 'local')
      return
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', handleFocus)
    intervalId = setInterval(() => {
      if (navigator.onLine) sync()
    }, SYNC_INTERVAL_MS)

    if (navigator.onLine && getStoredToken()) {
      initialDelayId = setTimeout(() => {
        initialDelayId = null
        sync()
      }, INITIAL_SYNC_DELAY_MS)
    }
  }

  function stop(): void {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    window.removeEventListener('focus', handleFocus)
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
    if (initialDelayId !== null) {
      clearTimeout(initialDelayId)
      initialDelayId = null
    }
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
