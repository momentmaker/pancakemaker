import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from './test-db.js'
import { runMigrations } from './migrations.js'
import {
  createUser,
  createRoute,
  createPanel,
  createCategory,
  createExpense,
  updateExpense,
  softDeleteExpense,
  type ExpenseRow,
} from './queries.js'
import { generateRecurringExpenses } from './recurring-generator.js'
import { getRenewalRadar, selectComingUp, type UpcomingCharge } from './renewals.js'
import type { Database } from './interface.js'

describe('getRenewalRadar', () => {
  let db: Database
  let monthlyPanelId: string
  let annualPanelId: string
  let dailyPanelId: string
  let categoryId: string

  beforeEach(async () => {
    db = createTestDatabase()
    await runMigrations(db)
    const user = await createUser(db, 'test@example.com', 'USD')
    const route = await createRoute(db, user.id, 'personal')
    monthlyPanelId = (await createPanel(db, route.id, 'Monthly', 'USD', 1, 'monthly')).id
    annualPanelId = (await createPanel(db, route.id, 'Annual', 'USD', 2, 'annual')).id
    dailyPanelId = (await createPanel(db, route.id, 'Daily', 'USD', 0)).id
    categoryId = (await createCategory(db, route.id, 'Bills', '#ff0000', 0)).id
  })

  async function addSeries(
    panelId: string,
    date: string,
    amount: number,
    description: string,
  ): Promise<ExpenseRow> {
    return createExpense(db, { panelId, categoryId, amount, currency: 'USD', date, description })
  }

  async function copyOn(date: string): Promise<ExpenseRow> {
    const rows = await db.query<ExpenseRow>(
      'SELECT * FROM expenses WHERE date = ? AND source_expense_id IS NOT NULL',
      [date],
    )
    return rows[0]
  }

  it('lists the next charge of a monthly series with days until it', async () => {
    // #given
    await addSeries(monthlyPanelId, '2026-09-01', 150000, 'Rent')
    await generateRecurringExpenses(db, '2026-11-27')

    // #when
    const radar = await getRenewalRadar(db, '2026-11-27', 30)

    // #then
    expect(
      radar.upcoming.map((u) => ({ name: u.name, nextDate: u.nextDate, days: u.daysUntil })),
    ).toEqual([{ name: 'Rent', nextDate: '2026-12-01', days: 4 }])
  })

  it('sorts upcoming charges by date and leaves out charges beyond the window', async () => {
    // #given
    await addSeries(monthlyPanelId, '2026-11-15', 1799, 'Netflix')
    await addSeries(monthlyPanelId, '2026-11-01', 150000, 'Rent')
    await addSeries(annualPanelId, '2026-03-10', 8900, 'Domain')
    await generateRecurringExpenses(db, '2026-11-27')

    // #when
    const radar = await getRenewalRadar(db, '2026-11-27', 30)

    // #then
    expect(radar.upcoming.map((u) => u.name)).toEqual(['Rent', 'Netflix'])
  })

  it('includes an annual charge once the window reaches it', async () => {
    // #given
    await addSeries(annualPanelId, '2026-01-10', 8900, 'Domain')
    await generateRecurringExpenses(db, '2026-11-27')

    // #when
    const radar = await getRenewalRadar(db, '2026-11-27', 60)

    // #then
    expect(radar.upcoming.map((u) => [u.name, u.nextDate, u.recurrenceType])).toEqual([
      ['Domain', '2027-01-10', 'annual'],
    ])
  })

  it('uses the latest price for the next charge and flags the change', async () => {
    // #given
    await addSeries(monthlyPanelId, '2026-08-14', 1549, 'Netflix')
    await generateRecurringExpenses(db, '2026-10-20')
    await updateExpense(db, (await copyOn('2026-10-14')).id, { amount: 1799 })
    await generateRecurringExpenses(db, '2026-11-27')

    // #when
    const [netflix] = (await getRenewalRadar(db, '2026-11-27', 30)).upcoming

    // #then
    expect({ amount: netflix.amount, priceChange: netflix.priceChange }).toEqual({
      amount: 1799,
      priceChange: { from: 1549, to: 1799, since: '2026-10-14' },
    })
  })

  it('does not flag a price change for a steady series', async () => {
    // #given
    await addSeries(monthlyPanelId, '2026-08-14', 1549, 'Netflix')
    await generateRecurringExpenses(db, '2026-11-27')

    // #when
    const [netflix] = (await getRenewalRadar(db, '2026-11-27', 30)).upcoming

    // #then
    expect(netflix.priceChange).toBeNull()
  })

  it('counts every charge in the window toward its total', async () => {
    // #given
    await addSeries(monthlyPanelId, '2026-11-01', 150000, 'Rent')
    await generateRecurringExpenses(db, '2026-11-27')

    // #when
    const [rent] = (await getRenewalRadar(db, '2026-11-27', 90)).upcoming

    // #then
    expect({ count: rent.chargesInWindow, total: rent.totalInWindow }).toEqual({
      count: 3,
      total: 450000,
    })
  })

  it('moves a stopped series from upcoming to recently ended', async () => {
    // #given
    const original = await addSeries(monthlyPanelId, '2026-08-01', 1200, 'Gym')
    await generateRecurringExpenses(db, '2026-11-27')
    await updateExpense(db, original.id, { recurrenceEndDate: '2026-11-15' })

    // #when
    const radar = await getRenewalRadar(db, '2026-11-27', 30)

    // #then
    expect({
      upcoming: radar.upcoming.map((u) => u.name),
      ended: radar.ended.map((e) => [e.name, e.endDate]),
    }).toEqual({ upcoming: [], ended: [['Gym', '2026-11-15']] })
  })

  it('ignores expenses in panels that do not repeat', async () => {
    // #given
    await addSeries(dailyPanelId, '2026-11-20', 450, 'Coffee')

    // #when
    const radar = await getRenewalRadar(db, '2026-11-27', 30)

    // #then
    expect(radar.upcoming).toEqual([])
  })

  it('ignores a series whose original was deleted', async () => {
    // #given
    const original = await addSeries(monthlyPanelId, '2026-11-01', 150000, 'Rent')
    await softDeleteExpense(db, original.id)

    // #when
    const radar = await getRenewalRadar(db, '2026-11-27', 30)

    // #then
    expect(radar.upcoming).toEqual([])
  })

  it('falls back to the category name when the series has no description', async () => {
    // #given
    await createExpense(db, {
      panelId: monthlyPanelId,
      categoryId,
      amount: 5000,
      currency: 'USD',
      date: '2026-11-03',
    })

    // #when
    const [item] = (await getRenewalRadar(db, '2026-11-27', 30)).upcoming

    // #then
    expect(item.name).toBe('Bills')
  })
})

describe('selectComingUp', () => {
  function charge(name: string, daysUntil: number, recurrenceType: 'monthly' | 'annual') {
    return { name, daysUntil, recurrenceType } as unknown as UpcomingCharge
  }

  it('keeps charges due within 30 days', () => {
    const picked = selectComingUp([charge('Rent', 4, 'monthly'), charge('Gym', 45, 'monthly')])
    expect(picked.map((c) => c.name)).toEqual(['Rent'])
  })

  it('gives annual charges an early warning up to 60 days out', () => {
    const picked = selectComingUp([charge('Domain', 50, 'annual'), charge('Car', 75, 'annual')])
    expect(picked.map((c) => c.name)).toEqual(['Domain'])
  })

  it('shows at most five charges', () => {
    const many = Array.from({ length: 8 }, (_, i) => charge(`S${i}`, i, 'monthly'))
    expect(selectComingUp(many)).toHaveLength(5)
  })
})
