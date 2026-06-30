import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

// A view registers its ordered, visible items (identified by stable id) plus
// the per-item actions the keyboard cursor can invoke. The active item is
// tracked by id — not index — so deletions and re-renders never desync it.
export interface CursorItem {
  id: string
  open?: () => void
  remove?: () => void
  duplicate?: () => void
}

export interface KeyboardCursor {
  activeId: string | null
  registerList: (items: CursorItem[], getElement: (id: string) => HTMLElement | null) => void
  // Ask the cursor to land on an item id once a list containing it registers —
  // used for cross-view jumps (e.g. the command palette navigating to an expense).
  requestFocus: (id: string) => void
  move: (delta: number) => void
  moveToEdge: (edge: 'top' | 'bottom') => void
  open: () => void
  remove: () => void
  duplicate: () => void
  clear: () => void
}

const KeyboardCursorContext = createContext<KeyboardCursor | null>(null)

export function KeyboardCursorProvider({ children }: { children: ReactNode }) {
  const itemsRef = useRef<CursorItem[]>([])
  const getElementRef = useRef<(id: string) => HTMLElement | null>(() => null)
  const activeIdRef = useRef<string | null>(null)
  const pendingTargetRef = useRef<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const setActive = useCallback((id: string | null) => {
    activeIdRef.current = id
    setActiveId(id)
    if (id) getElementRef.current(id)?.focus()
  }, [])

  const registerList = useCallback(
    (items: CursorItem[], getElement: (id: string) => HTMLElement | null) => {
      const prevItems = itemsRef.current
      const prevId = activeIdRef.current
      itemsRef.current = items
      getElementRef.current = getElement

      // Cross-view targeting: the first non-empty registration after requestFocus
      // consumes the pending target — landing on it when present, else expiring it
      // so a stale id can't hijack a later unrelated list. Empty registrations (the
      // unmount cleanup) do not consume it, so navigate -> loading([]) -> loaded([id])
      // still lands. This must run before the prevId guard below: on cross-view
      // navigation prevId is already null (the prior view's cleanup cleared it).
      const pendingTarget = pendingTargetRef.current
      if (pendingTarget !== null && items.length > 0) {
        pendingTargetRef.current = null
        if (items.some((item) => item.id === pendingTarget)) {
          setActive(pendingTarget)
          return
        }
      }

      if (!prevId || items.some((item) => item.id === prevId)) return

      // The active item vanished. A deletion leaves the rest of the list intact
      // (anchor to the nearest surviving sibling); a context switch (tab/route)
      // replaces the list wholesale (drop the cursor).
      const overlap = items.some((item) => prevItems.some((prev) => prev.id === item.id))
      if (!overlap || items.length === 0) {
        setActive(null)
        return
      }
      const prevIndex = prevItems.findIndex((prev) => prev.id === prevId)
      const nextIndex = Math.min(Math.max(prevIndex, 0), items.length - 1)
      setActive(items[nextIndex]?.id ?? null)
    },
    [setActive],
  )

  const move = useCallback(
    (delta: number) => {
      const items = itemsRef.current
      if (items.length === 0) return
      const current = activeIdRef.current
        ? items.findIndex((item) => item.id === activeIdRef.current)
        : -1
      const next =
        current === -1
          ? delta > 0
            ? 0
            : items.length - 1
          : Math.min(items.length - 1, Math.max(0, current + delta))
      setActive(items[next].id)
    },
    [setActive],
  )

  const moveToEdge = useCallback(
    (edge: 'top' | 'bottom') => {
      const items = itemsRef.current
      if (items.length === 0) return
      setActive(edge === 'top' ? items[0].id : items[items.length - 1].id)
    },
    [setActive],
  )

  const runAction = useCallback((key: 'open' | 'remove' | 'duplicate') => {
    const item = itemsRef.current.find((candidate) => candidate.id === activeIdRef.current)
    item?.[key]?.()
  }, [])

  const open = useCallback(() => runAction('open'), [runAction])
  const remove = useCallback(() => runAction('remove'), [runAction])
  const duplicate = useCallback(() => runAction('duplicate'), [runAction])
  const clear = useCallback(() => {
    if (activeIdRef.current) getElementRef.current(activeIdRef.current)?.blur()
    setActive(null)
  }, [setActive])

  const requestFocus = useCallback((id: string) => {
    pendingTargetRef.current = id
  }, [])

  const value = useMemo<KeyboardCursor>(
    () => ({
      activeId,
      registerList,
      requestFocus,
      move,
      moveToEdge,
      open,
      remove,
      duplicate,
      clear,
    }),
    [activeId, registerList, requestFocus, move, moveToEdge, open, remove, duplicate, clear],
  )

  return <KeyboardCursorContext.Provider value={value}>{children}</KeyboardCursorContext.Provider>
}

export function useKeyboardCursor(): KeyboardCursor | null {
  return useContext(KeyboardCursorContext)
}

// Used by a view to register its visible list with the cursor. Returns the
// active item's id so the view can mark it (e.g. a .kbd-cursor class).
export function useListCursor(
  items: CursorItem[],
  getElement: (id: string) => HTMLElement | null,
): string | null {
  const cursor = useContext(KeyboardCursorContext)
  // registerList is stable across renders (the provider memoizes it), unlike
  // the cursor value itself, which changes identity on every activeId update.
  // Depending on the stable callback keeps the unmount cleanup from firing —
  // and wiping the registration — on every cursor move.
  const registerList = cursor?.registerList

  useEffect(() => {
    registerList?.(items, getElement)
  })

  useEffect(() => {
    return () => registerList?.([], () => null)
  }, [registerList])

  return cursor?.activeId ?? null
}
