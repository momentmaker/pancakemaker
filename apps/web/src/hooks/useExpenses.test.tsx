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
import { getTagsForExpenses } from '../db/lenses.js'
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

  it('restoring a deleted expense brings it back and queues a sync update', async () => {
    // #given
    const { result } = renderHook(() => useExpenses(panelId), { wrapper })
    let expenseId = ''
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
      await result.current.remove(expenseId)
    })

    // #when
    await act(async () => {
      await result.current.restore(expenseId)
    })

    // #then
    const entries = await db.query<{ action: string; payload: string }>(
      'SELECT action, payload FROM sync_log WHERE record_id = ? ORDER BY id',
      [expenseId],
    )
    expect({
      visible: result.current.expenses.map((e) => e.id),
      lastEntry: {
        action: entries.at(-1)!.action,
        deletedAt: JSON.parse(entries.at(-1)!.payload).deleted_at,
      },
    }).toEqual({ visible: [expenseId], lastEntry: { action: 'update', deletedAt: null } })
  })

  it('undoing a stopped series brings the months back and queues sync updates', async () => {
    // #given
    const panels = await getPanelsByRoute(db, appState.personalRouteId)
    const monthlyPanelId = panels.find((p) => p.recurrence_type === 'monthly')!.id
    await createExpense(db, {
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
    let stopped: Awaited<ReturnType<typeof result.current.stopRecurring>> | undefined
    await act(async () => {
      stopped = await result.current.stopRecurring(february)
    })

    // #when
    await act(async () => {
      await result.current.undoStopRecurring(stopped!)
    })

    // #then
    const updates = await db.query<{ action: string }>(
      "SELECT action FROM sync_log WHERE table_name = 'expenses' AND action = 'update'",
    )
    expect({
      dates: result.current.expenses.map((e) => e.date).sort(),
      updateCount: updates.length,
    }).toEqual({ dates: ['2026-01-01', '2026-02-01', '2026-03-01'], updateCount: 4 })
  })

  it('turns +tags in a new note into tags and keeps the note clean', async () => {
    // #given
    const { result } = renderHook(() => useExpenses(panelId), { wrapper })

    // #when
    let expenseId = ''
    await act(async () => {
      const expense = await result.current.add({
        panelId,
        categoryId,
        amount: 1500,
        currency: 'USD',
        date: '2026-01-15',
        description: 'ramen +japan-trip',
      })
      expenseId = expense.id
    })

    // #then
    expect({
      description: result.current.expenses[0].description,
      tags: (await getTagsForExpenses(db, [expenseId])).get(expenseId),
    }).toEqual({ description: 'ramen', tags: ['japan-trip'] })
  })

  it('tags an expense when +tags are added while editing its note', async () => {
    // #given
    const { result } = renderHook(() => useExpenses(panelId), { wrapper })
    let expenseId = ''
    await act(async () => {
      const expense = await result.current.add({
        panelId,
        categoryId,
        amount: 1500,
        currency: 'USD',
        date: '2026-01-15',
        description: 'ramen',
      })
      expenseId = expense.id
    })

    // #when
    await act(async () => {
      await result.current.update(expenseId, { description: 'ramen +japan-trip' })
    })

    // #then
    expect((await getTagsForExpenses(db, [expenseId])).get(expenseId)).toEqual(['japan-trip'])
  })

  it('removes a tag and can put it back', async () => {
    // #given
    const { result } = renderHook(() => useExpenses(panelId), { wrapper })
    let expenseId = ''
    await act(async () => {
      const expense = await result.current.add({
        panelId,
        categoryId,
        amount: 1500,
        currency: 'USD',
        date: '2026-01-15',
        description: 'ramen +japan-trip +work',
      })
      expenseId = expense.id
    })

    // #when
    await act(async () => {
      await result.current.removeTag(expenseId, 'japan-trip')
    })
    const afterRemove = result.current.tagsByExpense.get(expenseId)
    await act(async () => {
      await result.current.addTags(expenseId, ['japan-trip'])
    })

    // #then
    expect({ afterRemove, afterUndo: result.current.tagsByExpense.get(expenseId) }).toEqual({
      afterRemove: ['work'],
      afterUndo: ['japan-trip', 'work'],
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
