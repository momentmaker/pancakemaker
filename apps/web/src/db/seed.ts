import { PERSONAL_CATEGORIES, BUSINESS_CATEGORIES } from '@pancakemaker/shared'
import type { Database } from './interface.js'
import { createUser, createRoute, createCategory, createPanel } from './queries.js'

async function seedRoutes(
  db: Database,
  userId: string,
  baseCurrency: string,
): Promise<{ personalRouteId: string; businessRouteId: string }> {
  const personalRoute = await createRoute(db, userId, 'personal')
  const businessRoute = await createRoute(db, userId, 'business')

  for (let i = 0; i < PERSONAL_CATEGORIES.length; i++) {
    const cat = PERSONAL_CATEGORIES[i]
    await createCategory(db, personalRoute.id, cat.name, cat.color, i)
  }

  for (let i = 0; i < BUSINESS_CATEGORIES.length; i++) {
    const cat = BUSINESS_CATEGORIES[i]
    await createCategory(db, businessRoute.id, cat.name, cat.color, i)
  }

  await createPanel(db, personalRoute.id, 'Daily', baseCurrency, 0, null, true)
  await createPanel(db, personalRoute.id, 'Monthly', baseCurrency, 1, 'monthly')
  await createPanel(db, personalRoute.id, 'Annual', baseCurrency, 2, 'annual')

  await createPanel(db, businessRoute.id, 'Daily', baseCurrency, 0, null, true)
  await createPanel(db, businessRoute.id, 'Monthly', baseCurrency, 1, 'monthly')
  await createPanel(db, businessRoute.id, 'Annual', baseCurrency, 2, 'annual')

  return {
    personalRouteId: personalRoute.id,
    businessRouteId: businessRoute.id,
  }
}

export async function seedDefaultData(
  db: Database,
  email: string,
  baseCurrency = 'USD',
): Promise<{ userId: string; personalRouteId: string; businessRouteId: string }> {
  const user = await createUser(db, email, baseCurrency)
  const routes = await seedRoutes(db, user.id, baseCurrency)
  return { userId: user.id, ...routes }
}

export async function seedRoutesForUser(
  db: Database,
  userId: string,
  baseCurrency: string,
): Promise<{ personalRouteId: string; businessRouteId: string }> {
  return seedRoutes(db, userId, baseCurrency)
}
