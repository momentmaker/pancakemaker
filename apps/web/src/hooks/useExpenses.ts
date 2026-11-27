import { useState, useCallback, useRef } from 'react'
import { useDatabase } from '../db/DatabaseContext.js'
import {
  getExpensesByPanel,
  getExpensesByCategory,
  createExpense,
  updateExpense,
  softDeleteExpense,
  restoreExpense,
  logSyncEntry,
  type ExpenseRow,
  type CreateExpenseInput,
} from '../db/queries.js'
import {
  stopRecurringFrom,
  undoStopRecurring as undoStopRecurringInDb,
  type StopRecurringResult,
} from '../db/recurring-generator.js'
import { useAppState } from './useAppState.js'
import { useSync } from '../sync/SyncContext.js'

export interface UseExpensesParams {
  panelId?: string
  categoryId?: string
  month?: string
}

export function useExpenses(params: UseExpensesParams | string) {
  const normalized: UseExpensesParams = typeof params === 'string' ? { panelId: params } : params

  const db = useDatabase()
  const { userId } = useAppState()
  const { triggerSync, markPending, tableVersions } = useSync()
  const expenseVersion = tableVersions['expenses'] ?? 0
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(false)
  const queryKey = `${normalized.panelId}-${normalized.categoryId}-${normalized.month}`
  const lastQueryKeyRef = useRef('')

  // Clear stale rows the instant the query changes (category/panel/month) so
  // consumers — notably the keyboard cursor via useExpenseListCursor — never
  // register the previous query's expense ids while the reload is in flight.
  // Without this, a cross-view cursor jump's pending target is consumed and
  // expired against the old list before the new rows arrive.
  const [seenQueryKey, setSeenQueryKey] = useState(queryKey)
  if (queryKey !== seenQueryKey) {
    setSeenQueryKey(queryKey)
    setExpenses([])
  }

  const load = useCallback(async () => {
    const isNewQuery = queryKey !== lastQueryKeyRef.current
    if (isNewQuery) setLoading(true)
    try {
      let rows: ExpenseRow[]
      if (normalized.categoryId) {
        rows = await getExpensesByCategory(db, normalized.categoryId, normalized.month)
      } else if (normalized.panelId) {
        rows = await getExpensesByPanel(db, normalized.panelId, normalized.month)
      } else {
        rows = []
      }
      setExpenses(rows)
    } finally {
      setLoading(false)
      lastQueryKeyRef.current = queryKey
    }
  }, [db, normalized.panelId, normalized.categoryId, normalized.month, queryKey, expenseVersion])

  const add = useCallback(
    async (input: CreateExpenseInput) => {
      const expense = await createExpense(db, input)
      setExpenses((prev) => [expense, ...prev])
      await logSyncEntry(
        db,
        userId,
        'expenses',
        expense.id,
        'create',
        expense as unknown as Record<string, unknown>,
      )
      markPending()
      triggerSync()
      return expense
    },
    [db, userId, markPending, triggerSync],
  )

  const update = useCallback(
    async (id: string, updates: Partial<CreateExpenseInput>) => {
      const updated = await updateExpense(db, id, updates)
      if (updated) {
        setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)))
        await logSyncEntry(
          db,
          userId,
          'expenses',
          id,
          'update',
          updated as unknown as Record<string, unknown>,
        )
        markPending()
        triggerSync()
      }
      return updated
    },
    [db, userId, markPending, triggerSync],
  )

  const remove = useCallback(
    async (id: string) => {
      await softDeleteExpense(db, id)
      setExpenses((prev) => prev.filter((e) => e.id !== id))
      await logSyncEntry(db, userId, 'expenses', id, 'delete', { id })
      markPending()
      triggerSync()
    },
    [db, userId, markPending, triggerSync],
  )

  const restore = useCallback(
    async (id: string) => {
      const restored = await restoreExpense(db, id)
      if (!restored) return
      await logSyncEntry(db, userId, 'expenses', id, 'update', {
        id,
        deleted_at: null,
        updated_at: restored.updated_at,
      })
      markPending()
      triggerSync()
      await load()
    },
    [db, userId, markPending, triggerSync, load],
  )

  const stopRecurring = useCallback(
    async (copy: ExpenseRow): Promise<StopRecurringResult> => {
      const stopped = await stopRecurringFrom(db, copy)
      const { original, deletedIds } = stopped
      const deleted = new Set(deletedIds)
      setExpenses((prev) => prev.filter((e) => !deleted.has(e.id)))
      await logSyncEntry(db, userId, 'expenses', original.id, 'update', {
        id: original.id,
        recurrence_end_date: original.recurrence_end_date,
        updated_at: original.updated_at,
      })
      for (const id of deletedIds) {
        await logSyncEntry(db, userId, 'expenses', id, 'delete', { id })
      }
      markPending()
      triggerSync()
      return stopped
    },
    [db, userId, markPending, triggerSync],
  )

  const undoStopRecurring = useCallback(
    async (stopped: StopRecurringResult) => {
      const { original, restoredIds } = await undoStopRecurringInDb(db, stopped)
      await logSyncEntry(db, userId, 'expenses', original.id, 'update', {
        id: original.id,
        recurrence_end_date: original.recurrence_end_date,
        updated_at: original.updated_at,
      })
      for (const id of restoredIds) {
        await logSyncEntry(db, userId, 'expenses', id, 'update', {
          id,
          deleted_at: null,
          updated_at: original.updated_at,
        })
      }
      markPending()
      triggerSync()
      await load()
    },
    [db, userId, markPending, triggerSync, load],
  )

  return {
    expenses,
    loading,
    load,
    add,
    update,
    remove,
    restore,
    stopRecurring,
    undoStopRecurring,
  }
}
