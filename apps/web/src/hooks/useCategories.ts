import { useState, useCallback, useRef } from 'react'
import { useDatabase } from '../db/DatabaseContext.js'
import {
  getCategoriesByRoute,
  createCategory,
  updateCategory,
  deleteCategory,
  logSyncEntry,
  type CategoryRow,
} from '../db/queries.js'
import { useAppState } from './useAppState.js'
import { useSync } from '../sync/SyncContext.js'

export function useCategories(routeId: string) {
  const db = useDatabase()
  const { userId } = useAppState()
  const { triggerSync, markPending, tableVersions } = useSync()
  const categoryVersion = tableVersions['categories'] ?? 0
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    if (!loadedRef.current) setLoading(true)
    try {
      const rows = await getCategoriesByRoute(db, routeId)
      setCategories(rows)
    } finally {
      setLoading(false)
      loadedRef.current = true
    }
  }, [db, routeId, categoryVersion])

  const add = useCallback(
    async (name: string, color: string, sortOrder: number) => {
      const category = await createCategory(db, routeId, name, color, sortOrder)
      setCategories((prev) => [...prev, category].sort((a, b) => a.sort_order - b.sort_order))
      await logSyncEntry(
        db,
        userId,
        'categories',
        category.id,
        'create',
        category as unknown as Record<string, unknown>,
      )
      markPending()
      triggerSync()
      return category
    },
    [db, routeId, userId, markPending, triggerSync],
  )

  const update = useCallback(
    async (id: string, updates: Partial<Pick<CategoryRow, 'name' | 'color' | 'sort_order'>>) => {
      const updated = await updateCategory(db, id, updates)
      if (updated) {
        setCategories((prev) =>
          prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.sort_order - b.sort_order),
        )
        await logSyncEntry(
          db,
          userId,
          'categories',
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
    async (id: string, reassignToCategoryId?: string) => {
      await deleteCategory(db, id, reassignToCategoryId)
      setCategories((prev) => prev.filter((c) => c.id !== id))
      await logSyncEntry(db, userId, 'categories', id, 'delete', { id, reassignToCategoryId })
      markPending()
      triggerSync()
    },
    [db, userId, markPending, triggerSync],
  )

  return { categories, loading, load, add, update, remove }
}
