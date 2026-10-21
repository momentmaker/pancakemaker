import type { Database } from '../db/interface.js'
import type { SyncPullEntry } from './api-client.js'

const APPLY_BATCH_SIZE = 20

export const TABLE_PRIORITY: Record<string, number> = {
  users: 0,
  routes: 1,
  categories: 2,
  panels: 3,
  tags: 4,
  recurring_templates: 5,
  expenses: 6,
  expense_tags: 7,
}

export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export async function applyRemoteEntry(db: Database, entry: SyncPullEntry): Promise<void> {
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

export async function applyEntries(
  db: Database,
  entries: SyncPullEntry[],
  appliedTables: Set<string>,
): Promise<number> {
  const sorted = [...entries].sort((a, b) => {
    const pa = TABLE_PRIORITY[a.table_name] ?? 99
    const pb = TABLE_PRIORITY[b.table_name] ?? 99
    return pa - pb
  })

  let applied = 0
  for (let i = 0; i < sorted.length; i += APPLY_BATCH_SIZE) {
    const batch = sorted.slice(i, i + APPLY_BATCH_SIZE)
    for (const entry of batch) {
      try {
        await applyRemoteEntry(db, entry)
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
    if (i + APPLY_BATCH_SIZE < sorted.length) await yieldToMain()
  }
  return applied
}
