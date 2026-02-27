import { useState, useCallback, useRef } from 'react'
import { useDatabase } from '../db/DatabaseContext.js'
import {
  getExpensesByPanel,
  getExpensesByCategory,
  createExpense,
  updateExpense,
  softDeleteExpense,
  logSyncEntry,
  type ExpenseRow,
  type CreateExpenseInput,
} from '../db/queries.js'
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
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    if (!loadedRef.current) setLoading(true)
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
      loadedRef.current = true
    }
  }, [db, normalized.panelId, normalized.categoryId, normalized.month, expenseVersion])

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

  return { expenses, loading, load, add, update, remove }
}
