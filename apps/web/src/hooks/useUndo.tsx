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
import { UndoToast } from '../components/UndoToast'

export interface UndoEntry {
  message: string
  undo: () => Promise<void>
}

export interface UndoContextValue {
  offerUndo: (entry: UndoEntry) => void
  undoLast: () => Promise<void>
}

const UNDO_WINDOW_MS = 6000

export const UndoContext = createContext<UndoContextValue | null>(null)

export function UndoProvider({
  children,
  durationMs = UNDO_WINDOW_MS,
}: {
  children: ReactNode
  durationMs?: number
}) {
  const [entry, setEntry] = useState<UndoEntry | null>(null)
  const entryRef = useRef<UndoEntry | null>(null)

  const show = useCallback((next: UndoEntry | null) => {
    entryRef.current = next
    setEntry(next)
  }, [])

  useEffect(() => {
    if (!entry) return
    const timer = setTimeout(() => show(null), durationMs)
    return () => clearTimeout(timer)
  }, [entry, durationMs, show])

  const undoLast = useCallback(async () => {
    const pending = entryRef.current
    if (!pending) return
    show(null)
    await pending.undo()
  }, [show])

  const value = useMemo(() => ({ offerUndo: show, undoLast }), [show, undoLast])

  return (
    <UndoContext.Provider value={value}>
      {children}
      <UndoToast message={entry?.message ?? null} onUndo={undoLast} />
    </UndoContext.Provider>
  )
}

// Null outside a provider (demo, isolated tests): callers simply skip offering undo.
export function useUndo(): UndoContextValue | null {
  return useContext(UndoContext)
}
