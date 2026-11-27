import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from '../db/test-db.js'
import { runMigrations } from '../db/migrations.js'
import {
  createUser,
  createRoute,
  createPanel,
  createCategory,
  createExpense,
  createTag,
  addTagToExpense,
} from '../db/queries.js'
import type { Database } from '../db/interface.js'
import type { SyncPullEntry } from './api-client.js'
import { applyEntries, applyRemoteEntry } from './apply-entries.js'

let db: Database
let routeId: string
let userId: string
let panelId: string

beforeEach(async () => {
  db = createTestDatabase()
  await runMigrations(db)
  const user = await createUser(db, 'test@example.com', 'USD')
  userId = user.id
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

describe('applyRemoteEntry for tag links', () => {
  it('removes a tag link deleted on another device', async () => {
    // #given
    const cat = await createCategory(db, routeId, 'Meals', '#fff', 0)
    const expense = await createExpense(db, {
      panelId,
      categoryId: cat.id,
      amount: 100,
      currency: 'USD',
      date: '2026-01-02',
    })
    const tag = await createTag(db, userId, 'japan-trip')
    await addTagToExpense(db, expense.id, tag.id)

    // #when
    await applyRemoteEntry(db, {
      id: 'e1',
      table_name: 'expense_tags',
      record_id: `${expense.id}:${tag.id}`,
      action: 'delete',
      payload: JSON.stringify({ expense_id: expense.id, tag_id: tag.id }),
      local_timestamp: '2026-01-02T00:00:00.000Z',
      server_timestamp: '2026-01-02T00:00:00.000Z',
    })

    // #then
    const links = await db.query('SELECT * FROM expense_tags')
    expect(links).toHaveLength(0)
  })
})
