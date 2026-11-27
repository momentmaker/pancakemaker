import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from './test-db.js'
import { runMigrations } from './migrations.js'
import {
  createUser,
  createRoute,
  createPanel,
  createCategory,
  createExpense,
  getExpensesByCategory,
  softDeleteExpense,
  updateExpense,
  type ExpenseRow,
} from './queries.js'
import {
  calculateMissingDates,
  generateRecurringExpenses,
  stopRecurringFrom,
} from './recurring-generator.js'
import type { Database } from './interface.js'

describe('calculateMissingDates', () => {
  it('generates monthly dates from start when no prior generation', () => {
    const dates = calculateMissingDates('monthly', 1, '2026-01-01', null, '2026-03-15')
    expect(dates).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })

  it('generates monthly dates from last generated', () => {
    const dates = calculateMissingDates('monthly', 1, '2026-01-01', '2026-02-01', '2026-04-15')
    expect(dates).toEqual(['2026-03-01', '2026-04-01'])
  })

  it('returns empty when start date is in the future', () => {
    const dates = calculateMissingDates('monthly', 15, '2026-06-15', null, '2026-03-01')
    expect(dates).toEqual([])
  })

  it('handles day 28 correctly', () => {
    const dates = calculateMissingDates('monthly', 28, '2026-01-28', null, '2026-03-28')
    expect(dates).toEqual(['2026-01-28', '2026-02-28', '2026-03-28'])
  })

  it('generates annual dates', () => {
    const dates = calculateMissingDates('annual', 15, '2024-06-15', null, '2026-08-01')
    expect(dates).toEqual(['2024-06-15', '2025-06-15', '2026-06-15'])
  })

  it('generates annual dates from last generated', () => {
    const dates = calculateMissingDates('annual', 1, '2024-01-01', '2025-01-01', '2026-06-01')
    expect(dates).toEqual(['2026-01-01'])
  })

  it('returns empty when already up to date', () => {
    const dates = calculateMissingDates('monthly', 1, '2026-01-01', '2026-03-01', '2026-03-15')
    expect(dates).toEqual([])
  })

  it('includes today if it matches recurrence day', () => {
    const dates = calculateMissingDates('monthly', 15, '2026-01-15', '2026-02-15', '2026-03-15')
    expect(dates).toEqual(['2026-03-15'])
  })
})

describe('generateRecurringExpenses', () => {
  let db: Database
  let monthlyPanelId: string
  let categoryId: string

  beforeEach(async () => {
    db = createTestDatabase()
    await runMigrations(db)

    const user = await createUser(db, 'test@example.com', 'USD')
    const route = await createRoute(db, user.id, 'personal')
    const monthlyPanel = await createPanel(db, route.id, 'Monthly', 'USD', 1, 'monthly')
    monthlyPanelId = monthlyPanel.id
    const cat = await createCategory(db, route.id, 'Rent', '#ff0000', 0)
    categoryId = cat.id
  })

  it('generates expenses for original expenses in recurring panels', async () => {
    // #given
    await createExpense(db, {
      panelId: monthlyPanelId,
      categoryId,
      amount: 150000,
      currency: 'USD',
      date: '2026-01-01',
      description: 'Monthly rent',
      recurrenceDay: 1,
    })

    // #when
    const count = await generateRecurringExpenses(db)

    // #then
    expect(count).toBeGreaterThan(0)
    const expenses = await getExpensesByCategory(db, categoryId)
    expect(expenses.length).toBeGreaterThan(1)
    const generated = expenses.filter((e) => e.source_expense_id !== null)
    expect(generated.length).toBeGreaterThan(0)
    expect(generated[0].amount).toBe(150000)
    expect(generated[0].description).toBe('Monthly rent')
  })

  it('is idempotent — running twice produces no duplicates', async () => {
    // #given
    await createExpense(db, {
      panelId: monthlyPanelId,
      categoryId,
      amount: 150000,
      currency: 'USD',
      date: '2026-01-01',
      recurrenceDay: 1,
    })

    // #when
    await generateRecurringExpenses(db)
    const firstRun = await getExpensesByCategory(db, categoryId)
    await generateRecurringExpenses(db)
    const secondRun = await getExpensesByCategory(db, categoryId)

    // #then
    expect(secondRun.length).toBe(firstRun.length)
  })

  it('does not duplicate the original expense date', async () => {
    // #given
    await createExpense(db, {
      panelId: monthlyPanelId,
      categoryId,
      amount: 5000,
      currency: 'USD',
      date: '2026-01-15',
      recurrenceDay: 15,
    })

    // #when
    await generateRecurringExpenses(db)

    // #then
    const expenses = await getExpensesByCategory(db, categoryId)
    const jan15 = expenses.filter((e) => e.date === '2026-01-15')
    expect(jan15).toHaveLength(1)
  })

  it('returns 0 when no recurring panels exist', async () => {
    // #given — only non-recurring panels exist from seed

    // #when
    const count = await generateRecurringExpenses(db)

    // #then — monthlyPanel has no expenses yet in this case
    // We need a fresh db with no recurring panels
    const freshDb = createTestDatabase()
    await runMigrations(freshDb)
    const freshCount = await generateRecurringExpenses(freshDb)
    expect(freshCount).toBe(0)
  })

  it('skips deleted original expenses', async () => {
    // #given
    const expense = await createExpense(db, {
      panelId: monthlyPanelId,
      categoryId,
      amount: 150000,
      currency: 'USD',
      date: '2026-01-01',
      recurrenceDay: 1,
    })
    await db.execute('UPDATE expenses SET deleted_at = ? WHERE id = ?', [
      new Date().toISOString(),
      expense.id,
    ])

    // #when
    const count = await generateRecurringExpenses(db)

    // #then
    expect(count).toBe(0)
  })

  it('handles multiple original expenses in the same panel', async () => {
    // #given
    await createExpense(db, {
      panelId: monthlyPanelId,
      categoryId,
      amount: 150000,
      currency: 'USD',
      date: '2026-01-01',
      recurrenceDay: 1,
    })
    await createExpense(db, {
      panelId: monthlyPanelId,
      categoryId,
      amount: 5000,
      currency: 'USD',
      date: '2026-01-15',
      recurrenceDay: 15,
    })

    // #when
    const count = await generateRecurringExpenses(db)

    // #then
    expect(count).toBeGreaterThan(0)
    const expenses = await getExpensesByCategory(db, categoryId)
    const sources = new Set(
      expenses.filter((e) => e.source_expense_id).map((e) => e.source_expense_id),
    )
    expect(sources.size).toBe(2)
  })

  async function createMonthlyRent(date = '2026-01-01', amount = 150000): Promise<ExpenseRow> {
    return createExpense(db, {
      panelId: monthlyPanelId,
      categoryId,
      amount,
      currency: 'USD',
      date,
      recurrenceDay: 1,
    })
  }

  async function liveExpenses(): Promise<ExpenseRow[]> {
    const rows = await getExpensesByCategory(db, categoryId)
    return rows.sort((a, b) => a.date.localeCompare(b.date))
  }

  async function copyOn(date: string): Promise<ExpenseRow> {
    const rows = await db.query<ExpenseRow>(
      'SELECT * FROM expenses WHERE date = ? AND source_expense_id IS NOT NULL',
      [date],
    )
    return rows[0]
  }

  it('does not regenerate a month the user deleted', async () => {
    // #given
    await createMonthlyRent()
    await generateRecurringExpenses(db, '2026-03-15')
    await softDeleteExpense(db, (await copyOn('2026-03-01')).id)

    // #when
    await generateRecurringExpenses(db, '2026-03-15')

    // #then
    expect((await liveExpenses()).map((e) => e.date)).toEqual(['2026-01-01', '2026-02-01'])
  })

  it('gives a generated month the same id on every device', async () => {
    // #given
    const original = await createMonthlyRent()
    await generateRecurringExpenses(db, '2026-02-15')
    const firstDeviceId = (await copyOn('2026-02-01')).id
    await db.execute('DELETE FROM expenses WHERE source_expense_id = ?', [original.id])

    // #when
    await generateRecurringExpenses(db, '2026-02-15')

    // #then
    expect((await copyOn('2026-02-01')).id).toBe(firstDeviceId)
  })

  it('stops generating after the recurrence end date', async () => {
    // #given
    const original = await createMonthlyRent()
    await updateExpense(db, original.id, { recurrenceEndDate: '2026-02-15' })

    // #when
    await generateRecurringExpenses(db, '2026-04-15')

    // #then
    expect((await liveExpenses()).map((e) => e.date)).toEqual(['2026-01-01', '2026-02-01'])
  })

  it('carries a new price forward from the most recent month', async () => {
    // #given
    await createMonthlyRent('2026-01-01', 150000)
    await generateRecurringExpenses(db, '2026-02-15')
    await updateExpense(db, (await copyOn('2026-02-01')).id, { amount: 160000 })

    // #when
    await generateRecurringExpenses(db, '2026-04-15')

    // #then
    expect((await liveExpenses()).map((e) => e.amount)).toEqual([150000, 160000, 160000, 160000])
  })

  it('carries forward from the latest month that was not deleted', async () => {
    // #given
    await createMonthlyRent('2026-01-01', 150000)
    await generateRecurringExpenses(db, '2026-03-15')
    await updateExpense(db, (await copyOn('2026-02-01')).id, { amount: 160000 })
    await updateExpense(db, (await copyOn('2026-03-01')).id, { amount: 999 })
    await softDeleteExpense(db, (await copyOn('2026-03-01')).id)

    // #when
    await generateRecurringExpenses(db, '2026-04-15')

    // #then
    expect((await copyOn('2026-04-01')).amount).toBe(160000)
  })
})

describe('stopRecurringFrom', () => {
  let db: Database
  let original: ExpenseRow

  beforeEach(async () => {
    db = createTestDatabase()
    await runMigrations(db)
    const user = await createUser(db, 'test@example.com', 'USD')
    const route = await createRoute(db, user.id, 'personal')
    const panel = await createPanel(db, route.id, 'Monthly', 'USD', 1, 'monthly')
    const cat = await createCategory(db, route.id, 'Rent', '#ff0000', 0)
    original = await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 150000,
      currency: 'USD',
      date: '2026-01-01',
      recurrenceDay: 1,
    })
    await generateRecurringExpenses(db, '2026-04-15')
  })

  async function copyOn(date: string): Promise<ExpenseRow> {
    const rows = await db.query<ExpenseRow>(
      'SELECT * FROM expenses WHERE date = ? AND source_expense_id = ?',
      [date, original.id],
    )
    return rows[0]
  }

  async function liveDates(): Promise<string[]> {
    const rows = await db.query<{ date: string }>(
      'SELECT date FROM expenses WHERE deleted_at IS NULL ORDER BY date',
    )
    return rows.map((r) => r.date)
  }

  it('ends the series the day before the chosen month', async () => {
    // #when
    await stopRecurringFrom(db, await copyOn('2026-03-01'))

    // #then
    const rows = await db.query<ExpenseRow>('SELECT * FROM expenses WHERE id = ?', [original.id])
    expect(rows[0].recurrence_end_date).toBe('2026-02-28')
  })

  it('deletes the chosen month and every later month', async () => {
    // #when
    await stopRecurringFrom(db, await copyOn('2026-03-01'))

    // #then
    expect(await liveDates()).toEqual(['2026-01-01', '2026-02-01'])
  })

  it('returns the original and the deleted months so they can be synced', async () => {
    // #given
    const march = await copyOn('2026-03-01')
    const april = await copyOn('2026-04-01')

    // #when
    const result = await stopRecurringFrom(db, march)

    // #then
    expect({
      originalId: result.original.id,
      deletedIds: [...result.deletedIds].sort(),
    }).toEqual({ originalId: original.id, deletedIds: [march.id, april.id].sort() })
  })

  it('keeps the series stopped on later app loads', async () => {
    // #given
    await stopRecurringFrom(db, await copyOn('2026-03-01'))

    // #when
    await generateRecurringExpenses(db, '2026-08-15')

    // #then
    expect(await liveDates()).toEqual(['2026-01-01', '2026-02-01'])
  })
})
