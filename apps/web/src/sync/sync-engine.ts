import type { Database } from '../db/interface.js'
import { getUnsyncedEntries, markEntriesSynced, getLastSyncTimestamp } from '../db/queries.js'
import {
  pushEntries,
  pullEntries,
  getStoredToken,
  getStoredSyncCursor,
  storeSyncCursor,
  type SyncPullEntry,
} from './api-client.js'

export type SyncStatus = 'synced' | 'pending' | 'offline' | 'local'

export interface SyncEngine {
  getStatus(): SyncStatus
  sync(): Promise<void>
  start(): void
  stop(): void
  onStatusChange(listener: (status: SyncStatus) => void): () => void
}

const SYNC_INTERVAL_MS = 5 * 60 * 1000

export function createSyncEngine(db: Database): SyncEngine {
  let status: SyncStatus = !navigator.onLine ? 'offline' : getStoredToken() ? 'synced' : 'local'
  let intervalId: ReturnType<typeof setInterval> | null = null
  let syncing = false
  const listeners = new Set<(status: SyncStatus) => void>()

  function setStatus(next: SyncStatus): void {
    if (next === status) return
    status = next
    for (const fn of listeners) fn(status)
  }

  async function push(): Promise<boolean> {
    const entries = await getUnsyncedEntries(db)
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

    if (!result.success) return false

    await markEntriesSynced(
      db,
      entries.map((e) => e.id),
    )
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

    const result = await pullEntries(cursor)
    if (!result.success) return false

    for (const entry of result.data.entries) {
      try {
        await applyRemoteEntry(entry)
      } catch {
        // skip entries that fail to apply — don't block sync
      }
    }

    if (result.data.entries.length > 0) {
      storeSyncCursor(result.data.server_timestamp)
    }

    return true
  }

  async function sync(): Promise<void> {
    if (syncing) return
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

    try {
      const pushOk = await push()
      const pullOk = await pull()

      const remaining = await getUnsyncedEntries(db)
      if (!pushOk || !pullOk) {
        setStatus(navigator.onLine ? 'pending' : 'offline')
      } else if (remaining.length > 0) {
        setStatus('pending')
      } else {
        setStatus('synced')
      }
    } catch {
      setStatus(navigator.onLine ? 'pending' : 'offline')
    } finally {
      syncing = false
    }
  }

  function handleOnline(): void {
    sync()
  }

  function handleOffline(): void {
    setStatus('offline')
  }

  function handleFocus(): void {
    if (navigator.onLine) sync()
  }

  function start(): void {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', handleFocus)
    intervalId = setInterval(() => {
      if (navigator.onLine) sync()
    }, SYNC_INTERVAL_MS)

    if (navigator.onLine && getStoredToken()) sync()
  }

  function stop(): void {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    window.removeEventListener('focus', handleFocus)
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  function onStatusChange(listener: (s: SyncStatus) => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return {
    getStatus: () => status,
    sync,
    start,
    stop,
    onStatusChange,
  }
}
