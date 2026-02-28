import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from './test-db.js'
import { runMigrations } from './migrations.js'
import {
  createUser,
  getUserById,
  createRoute,
  getRoutesByUser,
  createCategory,
  getCategoriesByRoute,
  updateCategory,
  deleteCategory,
  createPanel,
  getPanelsByRoute,
  updatePanel,
  deletePanel,
  createExpense,
  getExpensesByPanel,
  updateExpense,
  softDeleteExpense,
  createTag,
  getTagsByUser,
  deleteTag,
  addTagToExpense,
  removeTagFromExpense,
  getTagsForExpense,
  logSyncEntry,
  getUnsyncedEntries,
  markEntriesSynced,
  getLastSyncTimestamp,
  pruneOldSyncEntries,
  getExportRows,
  getExpensesByCategory,
  getCategoryTotals,
} from './queries.js'
import type { Database } from './interface.js'

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
})

describe('users', () => {
  it('creates and retrieves a user', async () => {
    const user = await getUserById(db, userId)
    expect(user).not.toBeNull()
    expect(user!.email).toBe('test@example.com')
    expect(user!.base_currency).toBe('USD')
  })

  it('returns null for nonexistent user', async () => {
    const user = await getUserById(db, 'nonexistent')
    expect(user).toBeNull()
  })
})

describe('routes', () => {
  it('creates and lists routes', async () => {
    await createRoute(db, userId, 'business')
    const routes = await getRoutesByUser(db, userId)
    expect(routes).toHaveLength(2)
    expect(routes.map((r) => r.type)).toContain('personal')
    expect(routes.map((r) => r.type)).toContain('business')
  })
})

describe('categories', () => {
  it('creates and lists categories by route', async () => {
    await createCategory(db, routeId, 'Health', '#00ffcc', 0)
    await createCategory(db, routeId, 'Meals', '#ff6b9d', 1)

    const categories = await getCategoriesByRoute(db, routeId)
    expect(categories).toHaveLength(2)
    expect(categories[0].name).toBe('Health')
    expect(categories[1].name).toBe('Meals')
  })

  it('updates a category', async () => {
    const cat = await createCategory(db, routeId, 'Health', '#00ffcc', 0)
    const updated = await updateCategory(db, cat.id, { name: 'Wellness', color: '#ff0000' })
    expect(updated!.name).toBe('Wellness')
    expect(updated!.color).toBe('#ff0000')
  })

  it('deletes a category', async () => {
    const cat = await createCategory(db, routeId, 'Temp', '#000000', 0)
    await deleteCategory(db, cat.id)
    const categories = await getCategoriesByRoute(db, routeId)
    expect(categories).toHaveLength(0)
  })

  it('reassigns expenses to another category on delete', async () => {
    // #given
    const catA = await createCategory(db, routeId, 'Food', '#ff0000', 0)
    const catB = await createCategory(db, routeId, 'Meals', '#00ff00', 1)
    const panel = await createPanel(db, routeId, 'Monthly', 'USD', 0)
    const expense = await createExpense(db, {
      panelId: panel.id,
      categoryId: catA.id,
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
    })

    // #when
    await deleteCategory(db, catA.id, catB.id)

    // #then
    const categories = await getCategoriesByRoute(db, routeId)
    expect(categories).toHaveLength(1)
    expect(categories[0].id).toBe(catB.id)
    const expenses = await getExpensesByPanel(db, panel.id)
    expect(expenses).toHaveLength(1)
    expect(expenses[0].category_id).toBe(catB.id)
  })

  it('cascade-deletes expenses when no reassign target', async () => {
    // #given
    const cat = await createCategory(db, routeId, 'Food', '#ff0000', 0)
    const panel = await createPanel(db, routeId, 'Monthly', 'USD', 0)
    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
    })

    // #when
    await deleteCategory(db, cat.id)

    // #then
    const categories = await getCategoriesByRoute(db, routeId)
    expect(categories).toHaveLength(0)
    const expenses = await getExpensesByPanel(db, panel.id)
    expect(expenses).toHaveLength(0)
  })
})

describe('panels', () => {
  it('creates and lists panels by route', async () => {
    await createPanel(db, routeId, 'January', 'USD', 0)
    await createPanel(db, routeId, 'February', 'EUR', 1)

    const panels = await getPanelsByRoute(db, routeId)
    expect(panels).toHaveLength(2)
    expect(panels[0].name).toBe('January')
    expect(panels[1].currency).toBe('EUR')
  })

  it('updates a panel', async () => {
    const panel = await createPanel(db, routeId, 'Jan', 'USD', 0)
    const updated = await updatePanel(db, panel.id, { name: 'January 2026' })
    expect(updated!.name).toBe('January 2026')
  })

  it('deletes a panel', async () => {
    const panel = await createPanel(db, routeId, 'Temp', 'USD', 0)
    await deletePanel(db, panel.id)
    const panels = await getPanelsByRoute(db, routeId)
    expect(panels).toHaveLength(0)
  })
})

describe('expenses', () => {
  let panelId: string
  let categoryId: string

  beforeEach(async () => {
    const panel = await createPanel(db, routeId, 'Monthly', 'USD', 0)
    panelId = panel.id
    const cat = await createCategory(db, routeId, 'Health', '#00ffcc', 0)
    categoryId = cat.id
  })

  it('creates and lists expenses', async () => {
    await createExpense(db, {
      panelId,
      categoryId,
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
      description: 'Lunch',
    })

    const expenses = await getExpensesByPanel(db, panelId)
    expect(expenses).toHaveLength(1)
    expect(expenses[0].amount).toBe(1500)
    expect(expenses[0].description).toBe('Lunch')
  })

  it('creates recurring expense', async () => {
    const expense = await createExpense(db, {
      panelId,
      categoryId,
      amount: 9900,
      currency: 'USD',
      date: '2026-01-01',
      isRecurring: true,
      recurrenceType: 'monthly',
      recurrenceEndDate: '2026-12-31',
    })

    expect(expense.is_recurring).toBe(1)
    expect(expense.recurrence_type).toBe('monthly')
    expect(expense.recurrence_end_date).toBe('2026-12-31')
  })

  it('updates an expense', async () => {
    const expense = await createExpense(db, {
      panelId,
      categoryId,
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
    })

    const updated = await updateExpense(db, expense.id, { amount: 2000, description: 'Dinner' })
    expect(updated!.amount).toBe(2000)
    expect(updated!.description).toBe('Dinner')
  })

  it('soft deletes an expense', async () => {
    const expense = await createExpense(db, {
      panelId,
      categoryId,
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
    })

    await softDeleteExpense(db, expense.id)
    const expenses = await getExpensesByPanel(db, panelId)
    expect(expenses).toHaveLength(0)
  })
})

describe('tags', () => {
  it('creates and lists tags', async () => {
    await createTag(db, userId, 'groceries')
    await createTag(db, userId, 'work')

    const tags = await getTagsByUser(db, userId)
    expect(tags).toHaveLength(2)
    expect(tags[0].name).toBe('groceries')
    expect(tags[1].name).toBe('work')
  })

  it('deletes tag and cleans up expense_tags', async () => {
    const panel = await createPanel(db, routeId, 'Monthly', 'USD', 0)
    const cat = await createCategory(db, routeId, 'Health', '#00ffcc', 0)
    const expense = await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 1000,
      currency: 'USD',
      date: '2026-01-01',
    })
    const tag = await createTag(db, userId, 'test-tag')
    await addTagToExpense(db, expense.id, tag.id)

    await deleteTag(db, tag.id)

    const tags = await getTagsByUser(db, userId)
    expect(tags).toHaveLength(0)
    const expenseTags = await getTagsForExpense(db, expense.id)
    expect(expenseTags).toHaveLength(0)
  })
})

describe('expense tags', () => {
  let expenseId: string
  let tagId: string

  beforeEach(async () => {
    const panel = await createPanel(db, routeId, 'Monthly', 'USD', 0)
    const cat = await createCategory(db, routeId, 'Health', '#00ffcc', 0)
    const expense = await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 1000,
      currency: 'USD',
      date: '2026-01-01',
    })
    expenseId = expense.id
    const tag = await createTag(db, userId, 'groceries')
    tagId = tag.id
  })

  it('adds and retrieves tags for an expense', async () => {
    await addTagToExpense(db, expenseId, tagId)
    const tags = await getTagsForExpense(db, expenseId)
    expect(tags).toHaveLength(1)
    expect(tags[0].name).toBe('groceries')
  })

  it('removes a tag from an expense', async () => {
    await addTagToExpense(db, expenseId, tagId)
    await removeTagFromExpense(db, expenseId, tagId)
    const tags = await getTagsForExpense(db, expenseId)
    expect(tags).toHaveLength(0)
  })

  it('adding same tag twice is idempotent', async () => {
    await addTagToExpense(db, expenseId, tagId)
    await addTagToExpense(db, expenseId, tagId)
    const tags = await getTagsForExpense(db, expenseId)
    expect(tags).toHaveLength(1)
  })
})

describe('sync log', () => {
  it('logs and retrieves unsynced entries', async () => {
    // #given
    await logSyncEntry(db, userId, 'expenses', 'exp-1', 'create', { amount: 1000 })
    await logSyncEntry(db, userId, 'categories', 'cat-1', 'update', { name: 'Food' })

    // #when
    const entries = await getUnsyncedEntries(db)

    // #then
    expect(entries).toHaveLength(2)
    expect(entries[0].table_name).toBe('expenses')
    expect(entries[0].action).toBe('create')
    expect(entries[0].synced_at).toBeNull()
    expect(JSON.parse(entries[0].payload)).toEqual({ amount: 1000 })
  })

  it('marks entries as synced', async () => {
    // #given
    await logSyncEntry(db, userId, 'expenses', 'exp-1', 'create', { amount: 1000 })
    await logSyncEntry(db, userId, 'expenses', 'exp-2', 'create', { amount: 2000 })
    const entries = await getUnsyncedEntries(db)

    // #when
    await markEntriesSynced(db, [entries[0].id])

    // #then
    const remaining = await getUnsyncedEntries(db)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].record_id).toBe('exp-2')
  })

  it('returns null when no synced entries exist', async () => {
    // #given - no entries

    // #when
    const timestamp = await getLastSyncTimestamp(db)

    // #then
    expect(timestamp).toBeNull()
  })

  it('returns last sync timestamp', async () => {
    // #given
    await logSyncEntry(db, userId, 'expenses', 'exp-1', 'create', { amount: 1000 })
    const entries = await getUnsyncedEntries(db)
    await markEntriesSynced(db, [entries[0].id])

    // #when
    const timestamp = await getLastSyncTimestamp(db)

    // #then
    expect(timestamp).not.toBeNull()
  })

  it('handles markEntriesSynced with empty array', async () => {
    // #when / #then - should not throw
    await markEntriesSynced(db, [])
  })

  it('prunes old synced entries', async () => {
    // #given
    await logSyncEntry(db, userId, 'expenses', 'exp-1', 'create', { amount: 1000 })
    const entries = await getUnsyncedEntries(db)
    await markEntriesSynced(db, [entries[0].id])

    // backdate the synced_at to 30 days ago
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    await db.execute('UPDATE sync_log SET synced_at = ? WHERE id = ?', [oldDate, entries[0].id])

    // #when
    await pruneOldSyncEntries(db)

    // #then
    const remaining = await db.query<{ id: string }>('SELECT id FROM sync_log')
    expect(remaining).toHaveLength(0)
  })

  it('preserves unsynced entries during prune', async () => {
    // #given
    await logSyncEntry(db, userId, 'expenses', 'exp-1', 'create', { amount: 1000 })

    // #when
    await pruneOldSyncEntries(db)

    // #then
    const remaining = await getUnsyncedEntries(db)
    expect(remaining).toHaveLength(1)
  })

  it('preserves recently synced entries during prune', async () => {
    // #given
    await logSyncEntry(db, userId, 'expenses', 'exp-1', 'create', { amount: 1000 })
    const entries = await getUnsyncedEntries(db)
    await markEntriesSynced(db, [entries[0].id])

    // #when
    await pruneOldSyncEntries(db)

    // #then
    const remaining = await db.query<{ id: string }>('SELECT id FROM sync_log')
    expect(remaining).toHaveLength(1)
  })
})

describe('panels with flags', () => {
  it('sets is_default on first panel after migration', async () => {
    // #given
    const panel = await createPanel(db, routeId, 'First', 'USD', 0)

    // #when — re-read after migration set defaults
    const panels = await getPanelsByRoute(db, routeId)

    // #then
    expect(panels[0].is_default).toBe(0)
    expect(panels[0].is_archived).toBe(0)
  })

  it('filters archived panels by default', async () => {
    // #given
    const panel1 = await createPanel(db, routeId, 'Active', 'USD', 0)
    const panel2 = await createPanel(db, routeId, 'Archived', 'USD', 1)
    await updatePanel(db, panel2.id, { is_archived: 1 })

    // #when
    const active = await getPanelsByRoute(db, routeId)
    const all = await getPanelsByRoute(db, routeId, true)

    // #then
    expect(active).toHaveLength(1)
    expect(active[0].name).toBe('Active')
    expect(all).toHaveLength(2)
  })

  it('updates is_default flag', async () => {
    // #given
    const panel = await createPanel(db, routeId, 'Panel', 'USD', 0)

    // #when
    const updated = await updatePanel(db, panel.id, { is_default: 1 })

    // #then
    expect(updated!.is_default).toBe(1)
  })
})

describe('panels with recurrence', () => {
  it('creates panel with recurrence_type', async () => {
    // #given / #when
    const panel = await createPanel(db, routeId, 'Monthly', 'USD', 0, 'monthly')

    // #then
    expect(panel.recurrence_type).toBe('monthly')
    expect(panel.is_default).toBe(0)
  })

  it('creates panel with is_default flag', async () => {
    // #given / #when
    const panel = await createPanel(db, routeId, 'Daily', 'USD', 0, null, true)

    // #then
    expect(panel.is_default).toBe(1)
    expect(panel.recurrence_type).toBeNull()
  })

  it('creates panel with no recurrence by default', async () => {
    // #given / #when
    const panel = await createPanel(db, routeId, 'Trip', 'EUR', 0)

    // #then
    expect(panel.recurrence_type).toBeNull()
  })
})

describe('category-based queries', () => {
  let panelId: string
  let categoryId: string

  beforeEach(async () => {
    const panel = await createPanel(db, routeId, 'Monthly', 'USD', 0)
    panelId = panel.id
    const cat = await createCategory(db, routeId, 'Meals', '#ff6b9d', 0)
    categoryId = cat.id
  })

  it('gets expenses by category', async () => {
    // #given
    await createExpense(db, {
      panelId,
      categoryId,
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
    })
    await createExpense(db, {
      panelId,
      categoryId,
      amount: 2000,
      currency: 'USD',
      date: '2026-02-10',
    })

    // #when
    const all = await getExpensesByCategory(db, categoryId)

    // #then
    expect(all).toHaveLength(2)
  })

  it('filters expenses by category and month', async () => {
    // #given
    await createExpense(db, {
      panelId,
      categoryId,
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
    })
    await createExpense(db, {
      panelId,
      categoryId,
      amount: 2000,
      currency: 'USD',
      date: '2026-02-10',
    })

    // #when
    const jan = await getExpensesByCategory(db, categoryId, '2026-01')

    // #then
    expect(jan).toHaveLength(1)
    expect(jan[0].amount).toBe(1500)
  })

  it('excludes soft-deleted expenses from category query', async () => {
    // #given
    const expense = await createExpense(db, {
      panelId,
      categoryId,
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
    })
    await softDeleteExpense(db, expense.id)

    // #when
    const expenses = await getExpensesByCategory(db, categoryId)

    // #then
    expect(expenses).toHaveLength(0)
  })

  it('gets category totals for a route and month', async () => {
    // #given
    const cat2 = await createCategory(db, routeId, 'Transport', '#00aaff', 1)
    await createExpense(db, {
      panelId,
      categoryId,
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
    })
    await createExpense(db, {
      panelId,
      categoryId,
      amount: 2000,
      currency: 'USD',
      date: '2026-01-20',
    })
    await createExpense(db, {
      panelId,
      categoryId: cat2.id,
      amount: 500,
      currency: 'USD',
      date: '2026-01-10',
    })

    // #when
    const totals = await getCategoryTotals(db, routeId, '2026-01')

    // #then
    expect(totals).toHaveLength(2)
    const mealTotal = totals.find((t) => t.category_id === categoryId)
    const transportTotal = totals.find((t) => t.category_id === cat2.id)
    expect(mealTotal!.total).toBe(3500)
    expect(mealTotal!.count).toBe(2)
    expect(transportTotal!.total).toBe(500)
    expect(transportTotal!.count).toBe(1)
  })

  it('returns empty totals for month with no expenses', async () => {
    // #given - no expenses

    // #when
    const totals = await getCategoryTotals(db, routeId, '2026-03')

    // #then
    expect(totals).toHaveLength(0)
  })
})

describe('expenses with source_expense_id', () => {
  it('creates expense linked to a source expense', async () => {
    // #given
    const panel = await createPanel(db, routeId, 'Monthly', 'USD', 0, 'monthly')
    const cat = await createCategory(db, routeId, 'Rent', '#ff0000', 0)
    const original = await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 150000,
      currency: 'USD',
      date: '2026-01-01',
      recurrenceDay: 1,
    })

    // #when
    const generated = await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 150000,
      currency: 'USD',
      date: '2026-02-01',
      sourceExpenseId: original.id,
      recurrenceDay: 1,
    })

    // #then
    expect(generated.source_expense_id).toBe(original.id)
    expect(generated.recurrence_day).toBe(1)
  })
})

describe('export', () => {
  it('returns joined expense rows for export', async () => {
    // #given
    const category = await createCategory(db, routeId, 'Health', '#00ffcc', 0)
    const panel = await createPanel(db, routeId, 'Jan 2026', 'USD', 0)
    await createExpense(db, {
      panelId: panel.id,
      categoryId: category.id,
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
      description: 'Gym',
    })

    // #when
    const rows = await getExportRows(db, userId)

    // #then
    expect(rows).toHaveLength(1)
    expect(rows[0].category).toBe('Health')
    expect(rows[0].panel).toBe('Jan 2026')
    expect(rows[0].route_type).toBe('personal')
    expect(rows[0].amount).toBe(1500)
    expect(rows[0].description).toBe('Gym')
  })

  it('excludes soft-deleted expenses', async () => {
    // #given
    const category = await createCategory(db, routeId, 'Health', '#00ffcc', 0)
    const panel = await createPanel(db, routeId, 'Jan 2026', 'USD', 0)
    const expense = await createExpense(db, {
      panelId: panel.id,
      categoryId: category.id,
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
    })
    await softDeleteExpense(db, expense.id)

    // #when
    const rows = await getExportRows(db, userId)

    // #then
    expect(rows).toHaveLength(0)
  })
})
