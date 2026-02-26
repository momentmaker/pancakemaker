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
} from './queries.js'
import { calculateMissingDates, generateRecurringExpenses } from './recurring-generator.js'
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
})
