import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { DatabaseProvider } from '../db/DatabaseContext.js'
import { AppStateContext, type AppState } from './useAppState.js'
import { SyncProvider } from '../sync/SyncContext.js'
import { createTestDatabase } from '../db/test-db.js'
import { runMigrations } from '../db/migrations.js'
import { seedDefaultData } from '../db/seed.js'
import { getPanelsByRoute, getCategoriesByRoute, createExpense } from '../db/queries.js'
import { useExpenses } from './useExpenses.js'
import type { Database } from '../db/interface.js'

let db: Database
let panelId: string
let categoryId: string
let appState: AppState

function wrapper({ children }: { children: ReactNode }) {
  return (
    <DatabaseProvider database={db}>
      <AppStateContext.Provider value={appState}>
        <SyncProvider>{children}</SyncProvider>
      </AppStateContext.Provider>
    </DatabaseProvider>
  )
}

beforeEach(async () => {
  db = createTestDatabase()
  await runMigrations(db)
  const seed = await seedDefaultData(db, 'test@example.com')
  appState = {
    userId: seed.userId,
    personalRouteId: seed.personalRouteId,
    businessRouteId: seed.businessRouteId,
    baseCurrency: 'USD',
  }
  const panels = await getPanelsByRoute(db, seed.personalRouteId)
  panelId = panels[0].id
  const categories = await getCategoriesByRoute(db, seed.personalRouteId)
  categoryId = categories[0].id
})

describe('useExpenses', () => {
  it('loads expenses for a panel', async () => {
    const { result } = renderHook(() => useExpenses(panelId), { wrapper })

    await act(async () => {
      await result.current.load()
    })

    expect(result.current.expenses).toHaveLength(0)
    expect(result.current.loading).toBe(false)
  })

  it('adds an expense', async () => {
    const { result } = renderHook(() => useExpenses(panelId), { wrapper })

    await act(async () => {
      await result.current.add({
        panelId,
        categoryId,
        amount: 1500,
        currency: 'USD',
        date: '2026-01-15',
        description: 'Test expense',
      })
    })

    expect(result.current.expenses).toHaveLength(1)
    expect(result.current.expenses[0].amount).toBe(1500)
  })

  it('updates an expense', async () => {
    const { result } = renderHook(() => useExpenses(panelId), { wrapper })

    let expenseId: string
    await act(async () => {
      const expense = await result.current.add({
        panelId,
        categoryId,
        amount: 1500,
        currency: 'USD',
        date: '2026-01-15',
      })
      expenseId = expense.id
    })

    await act(async () => {
      await result.current.update(expenseId!, { amount: 2500 })
    })

    expect(result.current.expenses[0].amount).toBe(2500)
  })

  it('removes an expense', async () => {
    const { result } = renderHook(() => useExpenses(panelId), { wrapper })

    let expenseId: string
    await act(async () => {
      const expense = await result.current.add({
        panelId,
        categoryId,
        amount: 1500,
        currency: 'USD',
        date: '2026-01-15',
      })
      expenseId = expense.id
    })

    await act(async () => {
      await result.current.remove(expenseId!)
    })

    expect(result.current.expenses).toHaveLength(0)
  })

  it('loads expenses by category', async () => {
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
    const { result } = renderHook(() => useExpenses({ categoryId }), { wrapper })

    await act(async () => {
      await result.current.load()
    })

    // #then
    expect(result.current.expenses).toHaveLength(2)
  })

  it('loads expenses by category and month', async () => {
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
    const { result } = renderHook(() => useExpenses({ categoryId, month: '2026-01' }), { wrapper })

    await act(async () => {
      await result.current.load()
    })

    // #then
    expect(result.current.expenses).toHaveLength(1)
    expect(result.current.expenses[0].amount).toBe(1500)
  })
})
