import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'

type ScrubHandler = (delta: number) => void

export interface MonthScrubContextValue {
  register: (handler: ScrubHandler | null) => void
  scrub: (delta: number) => void
}

// Exported so tests can provide a stub value without the full provider.
export const MonthScrubContext = createContext<MonthScrubContextValue | null>(null)

// Lets the global keyboard layer move the active view's month. The active
// month-picker view registers a handler; `scrub` calls it (a no-op when none is
// registered), mirroring KeyboardCursorProvider's single-registration model.
export function MonthScrubProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<ScrubHandler | null>(null)

  const register = useCallback((handler: ScrubHandler | null) => {
    handlerRef.current = handler
  }, [])

  const scrub = useCallback((delta: number) => {
    handlerRef.current?.(delta)
  }, [])

  const value = useMemo<MonthScrubContextValue>(() => ({ register, scrub }), [register, scrub])

  return <MonthScrubContext.Provider value={value}>{children}</MonthScrubContext.Provider>
}

// A month-picker view registers its scrub handler while mounted. The context is
// read with optional chaining so views rendered without a MonthScrubProvider
// (e.g. the demo layout) do not crash; the handler is held in a ref so the
// stable registration always calls the latest closure without re-subscribing.
export function useMonthScrub(handler: ScrubHandler): void {
  const register = useContext(MonthScrubContext)?.register
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!register) return
    register((delta) => handlerRef.current(delta))
    return () => register(null)
  }, [register])
}

export function useMonthScrubControls(): MonthScrubContextValue | null {
  return useContext(MonthScrubContext)
}
