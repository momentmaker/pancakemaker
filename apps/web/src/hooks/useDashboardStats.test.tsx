import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { DatabaseProvider } from '../db/DatabaseContext.js'
import { AppStateContext, type AppState } from './useAppState.js'
import { SyncProvider } from '../sync/SyncContext.js'
import { createTestDatabase } from '../db/test-db.js'
import { runMigrations } from '../db/migrations.js'
import { seedDefaultData } from '../db/seed.js'
import {
  createPanel,
  createCategory,
  createExpense,
  getDashboardExpenses,
  getDashboardRecentExpenses,
} from '../db/queries.js'
import { useDashboardStats } from './useDashboardStats.js'
import type { Database } from '../db/interface.js'

let db: Database
let appState: AppState
let personalRouteId: string
let businessRouteId: string

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
  personalRouteId = seed.personalRouteId
  businessRouteId = seed.businessRouteId
  appState = {
    userId: seed.userId,
    personalRouteId,
    businessRouteId,
    baseCurrency: 'USD',
  }
})

describe('getDashboardExpenses', () => {
  it('returns expenses from both routes for a given month', async () => {
    // #given
    const pPanel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const bPanel = await createPanel(db, businessRouteId, 'Daily', 'USD', 0)
    const pCat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)
    const bCat = await createCategory(db, businessRouteId, 'Office', '#00ff00', 0)

    await createExpense(db, {
      panelId: pPanel.id,
      categoryId: pCat.id,
      amount: 1000,
      currency: 'USD',
      date: '2026-01-15',
    })
    await createExpense(db, {
      panelId: bPanel.id,
      categoryId: bCat.id,
      amount: 2000,
      currency: 'USD',
      date: '2026-01-20',
    })
    await createExpense(db, {
      panelId: pPanel.id,
      categoryId: pCat.id,
      amount: 500,
      currency: 'USD',
      date: '2026-02-05',
    })

    // #when
    const jan = await getDashboardExpenses(db, personalRouteId, businessRouteId, '2026-01')

    // #then
    expect(jan).toHaveLength(2)
  })

  it('excludes soft-deleted expenses', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const cat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)
    const expense = await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 1000,
      currency: 'USD',
      date: '2026-01-15',
    })
    await db.execute('UPDATE expenses SET deleted_at = ? WHERE id = ?', [
      new Date().toISOString(),
      expense.id,
    ])

    // #when
    const result = await getDashboardExpenses(db, personalRouteId, businessRouteId, '2026-01')

    // #then
    expect(result).toHaveLength(0)
  })
})

describe('getDashboardRecentExpenses', () => {
  it('returns most recent expenses across both routes', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const cat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)
    for (let i = 1; i <= 12; i++) {
      await createExpense(db, {
        panelId: panel.id,
        categoryId: cat.id,
        amount: i * 100,
        currency: 'USD',
        date: `2026-01-${String(i).padStart(2, '0')}`,
      })
    }

    // #when
    const recent = await getDashboardRecentExpenses(db, personalRouteId, businessRouteId, 10)

    // #then
    expect(recent).toHaveLength(10)
    expect(recent[0].panel_name).toBe('Daily')
  })
})

describe('useDashboardStats', () => {
  it('returns zeros for empty month', async () => {
    // #given — no expenses

    // #when
    const { result } = renderHook(() => useDashboardStats('2026-03'), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats).not.toBeNull()
    expect(result.current.stats!.totalAmount).toBe(0)
    expect(result.current.stats!.personalAmount).toBe(0)
    expect(result.current.stats!.businessAmount).toBe(0)
    expect(result.current.stats!.totalExpenses).toBe(0)
    expect(result.current.stats!.categoryBreakdown).toHaveLength(0)
  })

  it('returns correct totals with same-currency expenses', async () => {
    // #given
    const pPanel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const bPanel = await createPanel(db, businessRouteId, 'Daily', 'USD', 0)
    const pCat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)
    const bCat = await createCategory(db, businessRouteId, 'Office', '#00ff00', 0)

    await createExpense(db, {
      panelId: pPanel.id,
      categoryId: pCat.id,
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
    })
    await createExpense(db, {
      panelId: bPanel.id,
      categoryId: bCat.id,
      amount: 3000,
      currency: 'USD',
      date: '2026-01-20',
    })

    // #when
    const { result } = renderHook(() => useDashboardStats('2026-01'), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.totalAmount).toBe(4500)
    expect(result.current.stats!.personalAmount).toBe(1500)
    expect(result.current.stats!.businessAmount).toBe(3000)
    expect(result.current.stats!.totalExpenses).toBe(2)
  })

  it('returns category breakdown sorted by amount', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const catA = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)
    const catB = await createCategory(db, personalRouteId, 'Transport', '#00ff00', 1)

    await createExpense(db, {
      panelId: panel.id,
      categoryId: catA.id,
      amount: 1000,
      currency: 'USD',
      date: '2026-01-15',
    })
    await createExpense(db, {
      panelId: panel.id,
      categoryId: catB.id,
      amount: 5000,
      currency: 'USD',
      date: '2026-01-15',
    })

    // #when
    const { result } = renderHook(() => useDashboardStats('2026-01'), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.categoryBreakdown[0].name).toBe('Transport')
    expect(result.current.stats!.categoryBreakdown[0].amount).toBe(5000)
    expect(result.current.stats!.categoryBreakdown[1].name).toBe('Food')
  })

  it('computes prevMonthTotal from previous month data', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const cat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)

    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 2000,
      currency: 'USD',
      date: '2025-12-15',
    })
    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 3000,
      currency: 'USD',
      date: '2026-01-10',
    })

    // #when
    const { result } = renderHook(() => useDashboardStats('2026-01'), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.totalAmount).toBe(3000)
    expect(result.current.stats!.prevMonthTotal).toBe(2000)
  })

  it('returns null prevMonthTotal when previous month has no expenses', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const cat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)
    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 1000,
      currency: 'USD',
      date: '2026-01-15',
    })

    // #when
    const { result } = renderHook(() => useDashboardStats('2026-01'), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.prevMonthTotal).toBeNull()
  })

  it('returns day breakdown with correct day count for January', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const cat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)
    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 1000,
      currency: 'USD',
      date: '2026-01-15',
    })

    // #when
    const { result } = renderHook(() => useDashboardStats('2026-01'), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.dayBreakdown).toHaveLength(31)
    expect(result.current.stats!.dayBreakdown[14].value).toBe(1000)
    expect(result.current.stats!.dayBreakdown[0].value).toBe(0)
  })

  it('returns day breakdown with 28 days for Feb 2026', async () => {
    // #given — no expenses

    // #when
    const { result } = renderHook(() => useDashboardStats('2026-02'), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.dayBreakdown).toHaveLength(28)
  })

  it('biggestExpense is highest-amount, not most recent', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const cat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)

    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 500,
      currency: 'USD',
      date: '2026-01-20',
      description: 'Small recent',
    })
    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 9000,
      currency: 'USD',
      date: '2026-01-05',
      description: 'Big old',
    })

    // #when
    const { result } = renderHook(() => useDashboardStats('2026-01'), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.biggestExpense).not.toBeNull()
    expect(result.current.stats!.biggestExpense!.amount).toBe(9000)
    expect(result.current.stats!.biggestExpense!.description).toBe('Big old')
  })

  it('returns null biggestExpense when no expenses exist', async () => {
    // #given — no expenses

    // #when
    const { result } = renderHook(() => useDashboardStats('2026-03'), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.biggestExpense).toBeNull()
  })

  it('returns recent expenses in the stats', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const cat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)

    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
    })
    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 2500,
      currency: 'USD',
      date: '2026-01-16',
    })

    // #when
    const { result } = renderHook(() => useDashboardStats('2026-01'), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.recentExpenses).toHaveLength(2)
    expect(result.current.stats!.recentExpenses[0].date).toBe('2026-01-16')
  })

  it('computes burn rate with only one-time expenses', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const cat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)
    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 5000,
      currency: 'USD',
      date: '2026-01-15',
    })

    // #when
    const { result } = renderHook(() => useDashboardStats('2026-01'), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.burnRate.oneTime).toBe(5000)
    expect(result.current.stats!.burnRate.monthly).toBe(0)
    expect(result.current.stats!.burnRate.annualMonthly).toBe(0)
    expect(result.current.stats!.burnRate.total).toBe(5000)
  })

  it('computes burn rate with mixed recurrence types', async () => {
    // #given
    const dailyPanel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const monthlyPanel = await createPanel(db, personalRouteId, 'Monthly', 'USD', 1, 'monthly')
    const annualPanel = await createPanel(db, personalRouteId, 'Annual', 'USD', 2, 'annual')
    const cat = await createCategory(db, personalRouteId, 'Bills', '#ff0000', 0)

    await createExpense(db, {
      panelId: dailyPanel.id,
      categoryId: cat.id,
      amount: 3000,
      currency: 'USD',
      date: '2026-01-15',
    })
    await createExpense(db, {
      panelId: monthlyPanel.id,
      categoryId: cat.id,
      amount: 5000,
      currency: 'USD',
      date: '2026-01-01',
    })
    await createExpense(db, {
      panelId: annualPanel.id,
      categoryId: cat.id,
      amount: 12000,
      currency: 'USD',
      date: '2026-01-01',
    })

    // #when
    const { result } = renderHook(() => useDashboardStats('2026-01'), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.burnRate.oneTime).toBe(3000)
    expect(result.current.stats!.burnRate.monthly).toBe(5000)
    expect(result.current.stats!.burnRate.annualYearly).toBe(12000)
    expect(result.current.stats!.burnRate.annualMonthly).toBe(1000)
    expect(result.current.stats!.burnRate.total).toBe(9000)
  })

  it('returns zero burn rate for empty month', async () => {
    // #given — no expenses

    // #when
    const { result } = renderHook(() => useDashboardStats('2026-03'), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.burnRate.total).toBe(0)
  })

  it('computes projectedTotal for mid-month', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const cat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)
    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 10000,
      currency: 'USD',
      date: '2026-01-10',
    })
    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 5000,
      currency: 'USD',
      date: '2026-01-15',
    })

    // #when — passing daysElapsed=15 means $15000 over 15 days => $1000/day => $31000 projected
    const { result } = renderHook(() => useDashboardStats('2026-01', 15), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.daysElapsed).toBe(15)
    expect(result.current.stats!.projectedTotal).toBe(31000)
  })

  it('projectedTotal equals totalAmount for completed months', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const cat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)
    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 5000,
      currency: 'USD',
      date: '2025-11-10',
    })

    // #when — Nov 2025 has 30 days; override to make test deterministic
    const { result } = renderHook(() => useDashboardStats('2025-11', 30), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.daysElapsed).toBe(30)
    expect(result.current.stats!.projectedTotal).toBe(5000)
  })

  it('projectedTotal is computed when daysElapsed is exactly 2', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const cat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)
    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 6000,
      currency: 'USD',
      date: '2026-01-02',
    })

    // #when — 6000 over 2 days in Jan (31 days) => 3000/day => 93000 projected
    const { result } = renderHook(() => useDashboardStats('2026-01', 2), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.daysElapsed).toBe(2)
    expect(result.current.stats!.projectedTotal).toBe(93000)
  })

  it('projectedTotal is null when daysElapsed is less than 2', async () => {
    // #given — no expenses

    // #when — day 1 of month
    const { result } = renderHook(() => useDashboardStats('2026-03', 1), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.daysElapsed).toBe(1)
    expect(result.current.stats!.projectedTotal).toBeNull()
  })

  it('returns category trends for top categories', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const catA = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)
    const catB = await createCategory(db, personalRouteId, 'Transport', '#00ff00', 1)

    await createExpense(db, {
      panelId: panel.id,
      categoryId: catA.id,
      amount: 3000,
      currency: 'USD',
      date: '2026-01-15',
    })
    await createExpense(db, {
      panelId: panel.id,
      categoryId: catB.id,
      amount: 1000,
      currency: 'USD',
      date: '2026-01-15',
    })

    // #when
    const { result } = renderHook(() => useDashboardStats('2026-01', 15), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.categoryTrends.size).toBe(2)
    const foodTrend = result.current.stats!.categoryTrends.get(catA.id)
    expect(foodTrend).toHaveLength(6)
    expect(foodTrend![5].value).toBe(3000)
  })
})
