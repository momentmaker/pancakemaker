import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from '../db/test-db.js'
import { runMigrations } from '../db/migrations.js'
import { createUser, createRoute, createPanel } from '../db/queries.js'
import type { Database } from '../db/interface.js'
import type { SyncPullEntry } from './api-client.js'
import { applyEntries } from './apply-entries.js'

let db: Database
let routeId: string
let panelId: string

beforeEach(async () => {
  db = createTestDatabase()
  await runMigrations(db)
  const user = await createUser(db, 'test@example.com', 'USD')
  routeId = (await createRoute(db, user.id, 'personal')).id
  panelId = (await createPanel(db, routeId, 'Daily', 'USD', 0, null, true)).id
})

function entry(id: string, table: string, payload: Record<string, unknown>): SyncPullEntry {
  return {
    id,
    table_name: table,
    record_id: payload.id as string,
    action: 'create',
    payload: JSON.stringify(payload),
    local_timestamp: '2026-01-02T00:00:00.000Z',
    server_timestamp: '2026-01-02T00:00:00.000Z',
  }
}

function expenseEntry(id: string, categoryId: string): SyncPullEntry {
  return entry(`entry-${id}`, 'expenses', {
    id,
    panel_id: panelId,
    category_id: categoryId,
    amount: 100,
    currency: 'USD',
    date: '2026-01-02',
    is_recurring: 0,
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  })
}

const category = {
  id: 'cat-1',
  name: 'Remote',
  color: '#ffffff',
  sort_order: 0,
  created_at: '2026-01-02T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
}

describe('applyEntries', () => {
  it('applies a child listed before its parent by applying tables in priority order', async () => {
    // #given
    const entries = [
      expenseEntry('exp-1', 'cat-1'),
      entry('entry-cat-1', 'categories', { ...category, route_id: routeId }),
    ]

    // #when
    const applied = await applyEntries(db, entries, new Set())

    // #then
    expect(applied).toBe(2)
  })

  it('skips an entry that fails to apply and counts only the rest', async () => {
    // #given
    const entries = [
      entry('entry-cat-1', 'categories', { ...category, route_id: routeId }),
      expenseEntry('exp-orphan', 'missing-category'),
    ]

    // #when
    const applied = await applyEntries(db, entries, new Set())

    // #then
    expect(applied).toBe(1)
  })
})
