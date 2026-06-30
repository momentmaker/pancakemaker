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
import { useKeyboardCursor } from './useKeyboardCursor'
import { assignLabels, orderByPosition } from '../lib/keyboard/fhints'
import { FHintOverlay, type HintTarget } from '../components/FHintOverlay'

export interface FHintContextValue {
  openFHints: () => void
}

// Exported so tests can provide a stub value (e.g. for the keyboard hook).
export const FHintContext = createContext<FHintContextValue | null>(null)

// Collect the fully-in-viewport, marked targets, ordered top-to-bottom and
// left-to-right, and label them home-row-first. Overflow beyond the label pool
// is dropped (unbadged). A live snapshot — whatever is on screen right now.
function collectTargets(): HintTarget[] {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>('[data-kbd-item-id], [data-fhint]'),
  )
  const visible = elements
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(
      ({ rect }) =>
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth,
    )
    .map(({ element, rect }) => ({ element, top: rect.top, left: rect.left }))

  const ordered = orderByPosition(visible)
  const labels = assignLabels(ordered.length)
  return labels.map((label, index) => ({
    label,
    id: ordered[index].element.getAttribute('data-kbd-item-id'),
    element: ordered[index].element,
    rect: { top: ordered[index].top, left: ordered[index].left },
  }))
}

export function FHintProvider({ children }: { children: ReactNode }) {
  const cursor = useKeyboardCursor()
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor

  const [targets, setTargets] = useState<HintTarget[] | null>(null)

  const close = useCallback(() => setTargets(null), [])

  const openFHints = useCallback(() => {
    const found = collectTargets()
    if (found.length === 0) return // empty view — do not enter f-mode
    // Blur the active element so a focused element's own handlers (e.g. a
    // cursor-focused card's Enter) can't fire while f-mode owns the keyboard.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setTargets(found)
  }, [])

  useEffect(() => {
    if (!targets) return
    const activeTargets = targets

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      if (e.key === 'Escape') {
        close()
        return
      }
      const target = activeTargets.find((t) => t.label === e.key)
      if (target) {
        if (target.id) cursorRef.current?.activateItem(target.id)
        else target.element.click()
      }
      close() // match → activate + exit; mistype → exit silently
    }

    function onScroll() {
      close() // snapshot is stale once the layout moves; re-press f to re-snapshot
    }

    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [targets, close])

  const value = useMemo<FHintContextValue>(() => ({ openFHints }), [openFHints])

  return (
    <FHintContext.Provider value={value}>
      {children}
      {targets && <FHintOverlay targets={targets} />}
    </FHintContext.Provider>
  )
}

export function useFHints(): FHintContextValue | null {
  return useContext(FHintContext)
}
