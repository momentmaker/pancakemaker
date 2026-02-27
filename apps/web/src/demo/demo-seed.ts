import type { Database } from '../db/interface.js'
import type { AppState } from '../hooks/useAppState.js'
import { createUser, createRoute, createCategory, createPanel, createExpense } from '../db/queries.js'
import type { DemoPersona } from './demo-personas.js'

function dayOffsetToDate(dayOffset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  return d.toISOString().slice(0, 10)
}

export async function seedDemoData(db: Database, persona: DemoPersona): Promise<AppState> {
  const user = await createUser(db, `${persona.slug}@demo.pancakemaker.app`)

  const personalRoute = await createRoute(db, user.id, 'personal')
  const businessRoute = await createRoute(db, user.id, 'business')

  const categoryIds: string[] = []
  for (let i = 0; i < persona.categories.length; i++) {
    const cat = persona.categories[i]
    const routeId = cat.routeType === 'personal' ? personalRoute.id : businessRoute.id
    const row = await createCategory(db, routeId, cat.name, cat.color, i)
    categoryIds.push(row.id)
  }

  const panelIds: string[] = []
  const personalPanelCount = { count: 0 }
  const businessPanelCount = { count: 0 }
  for (const panel of persona.panels) {
    const routeId = panel.routeType === 'personal' ? personalRoute.id : businessRoute.id
    const counter = panel.routeType === 'personal' ? personalPanelCount : businessPanelCount
    const row = await createPanel(
      db,
      routeId,
      panel.name,
      panel.currency,
      counter.count,
      panel.recurrenceType,
      panel.isDefault,
    )
    panelIds.push(row.id)
    counter.count++
  }

  for (const expense of persona.expenses) {
    const categoryId = categoryIds[expense.categoryIndex]
    const panelId = panelIds[expense.panelIndex]
    if (!categoryId || !panelId) continue

    await createExpense(db, {
      panelId,
      categoryId,
      amount: expense.amount,
      currency: 'USD',
      date: dayOffsetToDate(expense.dayOffset),
      description: expense.description,
    })
  }

  return {
    userId: user.id,
    personalRouteId: personalRoute.id,
    businessRouteId: businessRoute.id,
    baseCurrency: 'USD',
  }
}
