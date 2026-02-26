import { useState, useCallback } from 'react'
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

export interface UseExpensesParams {
  panelId?: string
  categoryId?: string
  month?: string
}

export function useExpenses(params: UseExpensesParams | string) {
  const normalized: UseExpensesParams =
    typeof params === 'string' ? { panelId: params } : params

  const db = useDatabase()
  const { userId } = useAppState()
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
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
    }
  }, [db, normalized.panelId, normalized.categoryId, normalized.month])

  const add = useCallback(
    async (input: CreateExpenseInput) => {
      const expense = await createExpense(db, input)
      setExpenses((prev) => [expense, ...prev])
      await logSyncEntry(db, userId, 'expenses', expense.id, 'create', expense as unknown as Record<string, unknown>)
      return expense
    },
    [db, userId],
  )

  const update = useCallback(
    async (id: string, updates: Partial<CreateExpenseInput>) => {
      const updated = await updateExpense(db, id, updates)
      if (updated) {
        setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)))
        await logSyncEntry(db, userId, 'expenses', id, 'update', updated as unknown as Record<string, unknown>)
      }
      return updated
    },
    [db, userId],
  )

  const remove = useCallback(
    async (id: string) => {
      await softDeleteExpense(db, id)
      setExpenses((prev) => prev.filter((e) => e.id !== id))
      await logSyncEntry(db, userId, 'expenses', id, 'delete', { id })
    },
    [db, userId],
  )

  return { expenses, loading, load, add, update, remove }
}
