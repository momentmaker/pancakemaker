import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from './test-db.js'
import { runMigrations } from './migrations.js'
import { seedDefaultData } from './seed.js'
import {
  createExpense,
  getCategoriesByRoute,
  getPanelsByRoute,
  softDeleteExpense,
} from './queries.js'
import { getYearDailyTotals, getYearCategoryTotals } from './year.js'
import type { Database } from './interface.js'

let db: Database
let personalRouteId: string
let businessRouteId: string

beforeEach(async () => {
  db = createTestDatabase()
  await runMigrations(db)
  const seed = await seedDefaultData(db, 'me@example.com')
  personalRouteId = seed.personalRouteId
  businessRouteId = seed.businessRouteId
})

async function spend(routeId: string, categoryName: string, amount: number, date: string) {
  const [panel] = await getPanelsByRoute(db, routeId)
  const category = (await getCategoriesByRoute(db, routeId)).find((c) => c.name === categoryName)!
  return createExpense(db, {
    panelId: panel.id,
    categoryId: category.id,
    amount,
    currency: 'USD',
    date,
  })
}

describe('getYearDailyTotals', () => {
  it('sums each day across both routes, only for that year', async () => {
    // #given
    await spend(personalRouteId, 'Meals', 500, '2026-03-02')
    await spend(businessRouteId, 'Tools', 4900, '2026-03-02')
    await spend(personalRouteId, 'Meals', 700, '2025-12-31')
    const deleted = await spend(personalRouteId, 'Meals', 9999, '2026-03-03')
    await softDeleteExpense(db, deleted.id)

    // #when
    const rows = await getYearDailyTotals(db, personalRouteId, businessRouteId, '2026')

    // #then
    expect(rows).toEqual([{ date: '2026-03-02', currency: 'USD', total: 5400, count: 2 }])
  })
})

describe('getYearCategoryTotals', () => {
  it('totals each category for the year with its route', async () => {
    // #given
    await spend(personalRouteId, 'Meals', 500, '2026-03-02')
    await spend(personalRouteId, 'Meals', 700, '2026-07-01')
    await spend(businessRouteId, 'Tools', 4900, '2026-03-02')

    // #when
    const rows = await getYearCategoryTotals(db, personalRouteId, businessRouteId, '2026')

    // #then
    expect(
      rows.map((r) => [r.name, r.route_type, r.total]).sort((a, b) => Number(b[2]) - Number(a[2])),
    ).toEqual([
      ['Tools', 'business', 4900],
      ['Meals', 'personal', 1200],
    ])
  })
})
