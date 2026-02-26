import { useState, useCallback } from 'react'
import { useDatabase } from '../db/DatabaseContext.js'
import {
  getPanelsByRoute,
  createPanel,
  updatePanel,
  deletePanel,
  logSyncEntry,
  type PanelRow,
} from '../db/queries.js'
import { useAppState } from './useAppState.js'

export function usePanels(routeId: string, includeArchived = false) {
  const db = useDatabase()
  const { userId } = useAppState()
  const [panels, setPanels] = useState<PanelRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getPanelsByRoute(db, routeId, includeArchived)
      setPanels(rows)
    } finally {
      setLoading(false)
    }
  }, [db, routeId, includeArchived])

  const add = useCallback(
    async (
      name: string,
      currency: string,
      sortOrder: number,
      recurrenceType: 'monthly' | 'annual' | null = null,
    ) => {
      const panel = await createPanel(db, routeId, name, currency, sortOrder, recurrenceType)
      setPanels((prev) => [...prev, panel].sort((a, b) => a.sort_order - b.sort_order))
      await logSyncEntry(
        db,
        userId,
        'panels',
        panel.id,
        'create',
        panel as unknown as Record<string, unknown>,
      )
      return panel
    },
    [db, routeId, userId],
  )

  const update = useCallback(
    async (
      id: string,
      updates: Partial<
        Pick<PanelRow, 'name' | 'currency' | 'sort_order' | 'is_default' | 'is_archived'>
      >,
    ) => {
      const updated = await updatePanel(db, id, updates)
      if (updated) {
        setPanels((prev) =>
          prev.map((p) => (p.id === id ? updated : p)).sort((a, b) => a.sort_order - b.sort_order),
        )
        await logSyncEntry(
          db,
          userId,
          'panels',
          id,
          'update',
          updated as unknown as Record<string, unknown>,
        )
      }
      return updated
    },
    [db, userId],
  )

  const setDefault = useCallback(
    async (id: string) => {
      await db.transaction(async () => {
        await db.execute('UPDATE panels SET is_default = 0, updated_at = ? WHERE route_id = ?', [
          new Date().toISOString(),
          routeId,
        ])
        await db.execute('UPDATE panels SET is_default = 1, updated_at = ? WHERE id = ?', [
          new Date().toISOString(),
          id,
        ])
      })
      setPanels((prev) => prev.map((p) => ({ ...p, is_default: p.id === id ? 1 : 0 })))
      await logSyncEntry(db, userId, 'panels', id, 'update', { is_default: 1 })
    },
    [db, routeId, userId],
  )

  const archive = useCallback(
    async (id: string) => {
      await updatePanel(db, id, { is_archived: 1 })
      setPanels((prev) => {
        if (includeArchived) {
          return prev.map((p) => (p.id === id ? { ...p, is_archived: 1 } : p))
        }
        return prev.filter((p) => p.id !== id)
      })
      await logSyncEntry(db, userId, 'panels', id, 'update', { is_archived: 1 })
    },
    [db, userId, includeArchived],
  )

  const unarchive = useCallback(
    async (id: string) => {
      await updatePanel(db, id, { is_archived: 0 })
      setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, is_archived: 0 } : p)))
      await logSyncEntry(db, userId, 'panels', id, 'update', { is_archived: 0 })
    },
    [db, userId],
  )

  const remove = useCallback(
    async (id: string, reassignToPanelId?: string) => {
      await db.transaction(async () => {
        await deletePanel(db, id, reassignToPanelId)
      })
      setPanels((prev) => prev.filter((p) => p.id !== id))
      await logSyncEntry(db, userId, 'panels', id, 'delete', { id, reassignToPanelId })
    },
    [db, userId],
  )

  return { panels, loading, load, add, update, remove, setDefault, archive, unarchive }
}
