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
import { generateRecurringExpenses } from '../db/recurring-generator.js'
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

  it('stopping a recurring expense queues the end date and deletions for sync', async () => {
    // #given
    const panels = await getPanelsByRoute(db, appState.personalRouteId)
    const monthlyPanelId = panels.find((p) => p.recurrence_type === 'monthly')!.id
    const original = await createExpense(db, {
      panelId: monthlyPanelId,
      categoryId,
      amount: 150000,
      currency: 'USD',
      date: '2026-01-01',
      recurrenceDay: 1,
    })
    await generateRecurringExpenses(db, '2026-03-15')
    const { result } = renderHook(() => useExpenses({ panelId: monthlyPanelId }), { wrapper })
    await act(async () => {
      await result.current.load()
    })
    const february = result.current.expenses.find((e) => e.date === '2026-02-01')!

    // #when
    await act(async () => {
      await result.current.stopRecurring(february)
    })

    // #then
    const entries = await db.query<{ record_id: string; action: string }>(
      "SELECT record_id, action FROM sync_log WHERE table_name = 'expenses' ORDER BY id",
    )
    expect({
      entries: entries.map(
        (e) => `${e.action}:${e.record_id === original.id ? 'original' : 'copy'}`,
      ),
      remaining: result.current.expenses.map((e) => e.date),
    }).toEqual({
      entries: ['update:original', 'delete:copy', 'delete:copy'],
      remaining: ['2026-01-01'],
    })
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

  it('clears stale rows immediately when the query changes (before the reload resolves)', async () => {
    // #given a hook showing one category's expenses
    const { result, rerender } = renderHook(({ catId }) => useExpenses({ categoryId: catId }), {
      wrapper,
      initialProps: { catId: categoryId },
    })
    await act(async () => {
      await result.current.add({
        panelId,
        categoryId,
        amount: 1500,
        currency: 'USD',
        date: '2026-01-15',
      })
    })
    expect(result.current.expenses).toHaveLength(1)

    // #when the query switches to a different category
    rerender({ catId: 'a-different-category-id' })

    // #then the stale rows are gone synchronously — consumers (the keyboard cursor)
    // never register the previous category's ids while the reload is in flight.
    expect(result.current.expenses).toHaveLength(0)
  })
})
