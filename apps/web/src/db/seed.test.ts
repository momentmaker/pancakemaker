import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from './test-db.js'
import { runMigrations } from './migrations.js'
import { seedDefaultData } from './seed.js'
import { getCategoriesByRoute, getPanelsByRoute, getUserById, getRoutesByUser } from './queries.js'
import type { Database } from './interface.js'

describe('seedDefaultData', () => {
  let db: Database

  beforeEach(async () => {
    db = createTestDatabase()
    await runMigrations(db)
  })

  it('creates user, routes, categories, and panels', async () => {
    const result = await seedDefaultData(db, 'user@example.com', 'EUR')

    const user = await getUserById(db, result.userId)
    expect(user!.email).toBe('user@example.com')
    expect(user!.base_currency).toBe('EUR')

    const routes = await getRoutesByUser(db, result.userId)
    expect(routes).toHaveLength(2)
  })

  it('seeds 10 personal and 8 business categories', async () => {
    const result = await seedDefaultData(db, 'user@example.com')

    const personalCats = await getCategoriesByRoute(db, result.personalRouteId)
    expect(personalCats).toHaveLength(10)
    expect(personalCats[0].name).toBe('Health')

    const businessCats = await getCategoriesByRoute(db, result.businessRouteId)
    expect(businessCats).toHaveLength(8)
    expect(businessCats[0].name).toBe('Hosting')
  })

  it('creates default panels for each route', async () => {
    const result = await seedDefaultData(db, 'user@example.com', 'GBP')

    const personalPanels = await getPanelsByRoute(db, result.personalRouteId)
    expect(personalPanels).toHaveLength(3)
    expect(personalPanels[0].name).toBe('Daily')
    expect(personalPanels[0].currency).toBe('GBP')
    expect(personalPanels[0].is_default).toBe(1)
    expect(personalPanels[0].recurrence_type).toBeNull()
    expect(personalPanels[1].name).toBe('Monthly')
    expect(personalPanels[1].recurrence_type).toBe('monthly')
    expect(personalPanels[2].name).toBe('Annual')
    expect(personalPanels[2].recurrence_type).toBe('annual')

    const businessPanels = await getPanelsByRoute(db, result.businessRouteId)
    expect(businessPanels).toHaveLength(3)
    expect(businessPanels[0].name).toBe('Daily')
    expect(businessPanels[0].is_default).toBe(1)
  })
})
