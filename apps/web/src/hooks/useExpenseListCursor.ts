import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { ExpenseRowHandle } from '../components/ExpenseRow'
import { useListCursor, type CursorItem } from './useKeyboardCursor.js'
import { kbdItemSelector } from '../lib/keyboard/dom.js'

interface ExpenseListCursor {
  containerRef: React.RefObject<HTMLDivElement | null>
  activeId: string | null
  rowRef: (id: string) => (handle: ExpenseRowHandle | null) => void
}

// Wires a detail view's visible expense rows into the keyboard cursor: open
// edits the row, the two-tap delete is driven through the row's own confirm
// state, and moving the cursor disarms a row that was mid-confirm.
export function useExpenseListCursor(orderedIds: string[]): ExpenseListCursor {
  const handlesRef = useRef(new Map<string, ExpenseRowHandle>())
  const containerRef = useRef<HTMLDivElement>(null)
  const settersRef = useRef(new Map<string, (handle: ExpenseRowHandle | null) => void>())

  // Stable per-id ref callback so React doesn't detach/reattach every render.
  const rowRef = useCallback((id: string) => {
    let setter = settersRef.current.get(id)
    if (!setter) {
      setter = (handle: ExpenseRowHandle | null) => {
        if (handle) handlesRef.current.set(id, handle)
        else handlesRef.current.delete(id)
      }
      settersRef.current.set(id, setter)
    }
    return setter
  }, [])

  const getElement = useCallback(
    (id: string) => containerRef.current?.querySelector<HTMLElement>(kbdItemSelector(id)) ?? null,
    [],
  )

  const items = useMemo<CursorItem[]>(
    () =>
      orderedIds.map((id) => ({
        id,
        open: () => handlesRef.current.get(id)?.startEdit(),
        remove: () => {
          const handle = handlesRef.current.get(id)
          if (!handle) return
          // First press arms the row's confirm UI; the second commits it.
          if (handle.isConfirming()) handle.confirmDelete()
          else handle.startConfirmDelete()
        },
        duplicate: () => handlesRef.current.get(id)?.duplicate(),
      })),
    [orderedIds],
  )

  const activeId = useListCursor(items, getElement)

  const prevActiveRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevActiveRef.current
    if (prev && prev !== activeId) handlesRef.current.get(prev)?.cancelConfirm()
    prevActiveRef.current = activeId
  }, [activeId])

  return { containerRef, activeId, rowRef }
}
