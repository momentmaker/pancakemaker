import { describe, it, expect } from 'vitest'
import { createTestDatabase } from './test-db.js'
import { runMigrations } from './migrations.js'
import { seedDefaultData } from './seed.js'
import { getCategoriesByRoute, getPanelsByRoute } from './queries.js'
import { getTagsForExpenses } from './lenses.js'
import { saveNewExpense } from './save-expense.js'

describe('saveNewExpense', () => {
  it('stores the note without +tags, tags the expense and queues both for sync', async () => {
    // #given
    const db = createTestDatabase()
    await runMigrations(db)
    const seed = await seedDefaultData(db, 'me@example.com')
    const [panel] = await getPanelsByRoute(db, seed.personalRouteId)
    const [category] = await getCategoriesByRoute(db, seed.personalRouteId)

    // #when
    const expense = await saveNewExpense(db, seed.userId, {
      panelId: panel.id,
      categoryId: category.id,
      amount: 1500,
      currency: 'USD',
      date: '2026-03-02',
      description: 'ramen +japan-trip',
    })

    // #then
    const entries = await db.query<{ table_name: string }>(
      'SELECT table_name FROM sync_log ORDER BY id',
    )
    expect({
      description: expense.description,
      tags: (await getTagsForExpenses(db, [expense.id])).get(expense.id),
      synced: entries.map((e) => e.table_name),
    }).toEqual({
      description: 'ramen',
      tags: ['japan-trip'],
      synced: ['expenses', 'tags', 'expense_tags'],
    })
  })
})
