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

// A live snapshot of the on-screen marked targets, valid only until the layout
// moves — which is why f-mode exits on scroll rather than re-tracking.
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
    // Blur first so a focused element's own handlers (e.g. a cursor-focused
    // card's Enter) can't fire under f-mode, and so the snapshot below measures
    // post-blur geometry rather than positions shifted by focus styles.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    const found = collectTargets()
    if (found.length === 0) return // empty view — do not enter f-mode
    setTargets(found)
  }, [])

  useEffect(() => {
    if (!targets) return
    const activeTargets = targets

    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return // a held key never repeat-activates a hint
      // A modifier chord (Cmd/Ctrl/Alt) is never a hint label — exit and let the
      // browser or the global layer own the chord on the next press.
      if (e.metaKey || e.ctrlKey || e.altKey) {
        close()
        return
      }
      e.preventDefault()
      if (e.key === 'Escape') {
        close()
        return
      }
      // Labels are lowercase; match case-insensitively so Shift/CapsLock still hit.
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const target = activeTargets.find((t) => t.label === key)
      if (target) {
        if (target.id) cursorRef.current?.activateItem(target.id)
        else target.element.click()
      }
      close()
    }

    function onScroll() {
      close()
    }

    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
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
