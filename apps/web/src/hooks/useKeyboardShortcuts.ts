import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIsDesktop } from './useIsDesktop.js'
import { useKeyboardCursor } from './useKeyboardCursor.js'
import { useRoutePrefix } from '../demo/demo-context.js'
import { navItems } from '../components/nav-items.js'
import { resolveIntent, type KeyAction, type PendingPrefix } from '../lib/keyboard/intents.js'

const PENDING_TIMEOUT_MS = 800

const ROUTE_PATHS = new Map<KeyAction, string>(navItems.map((item) => [item.action, item.to]))

export interface KeyboardShortcutsOptions {
  onCheatsheet: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
    return true
  }
  return target.closest('[role="listbox"], [role="menu"]') !== null
}

// A native dialog or a custom popover (which marks itself with
// data-kbd-popover-open) owns the keyboard — the global handler stands down.
function isBlockingOverlayOpen(): boolean {
  return document.querySelector('dialog[open], [data-kbd-popover-open]') !== null
}

export function useKeyboardShortcuts({ onCheatsheet }: KeyboardShortcutsOptions): void {
  const isDesktop = useIsDesktop()
  const navigate = useNavigate()
  const routePrefix = useRoutePrefix()

  // Latest-value refs keep the long-lived listener from closing over stale
  // navigate/prefix/callback values without re-subscribing on every render.
  const cursor = useKeyboardCursor()

  const navigateRef = useRef(navigate)
  const prefixRef = useRef(routePrefix)
  const cheatsheetRef = useRef(onCheatsheet)
  const cursorRef = useRef(cursor)
  navigateRef.current = navigate
  prefixRef.current = routePrefix
  cheatsheetRef.current = onCheatsheet
  cursorRef.current = cursor

  const pendingRef = useRef<PendingPrefix>(null)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isDesktop) return

    function clearPending(): void {
      pendingRef.current = null
      if (pendingTimerRef.current !== null) {
        clearTimeout(pendingTimerRef.current)
        pendingTimerRef.current = null
      }
    }

    function blurActiveElement(): void {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    }

    function dispatch(action: KeyAction, fieldFocused: boolean): void {
      const cursor = cursorRef.current
      const routePath = ROUTE_PATHS.get(action)
      if (routePath !== undefined) {
        navigateRef.current(`${prefixRef.current}${routePath}`)
        return
      }
      switch (action) {
        case 'cheatsheet':
          cheatsheetRef.current()
          return
        case 'cursor-down':
          cursor?.move(1)
          return
        case 'cursor-up':
          cursor?.move(-1)
          return
        case 'cursor-top':
          cursor?.moveToEdge('top')
          return
        case 'cursor-bottom':
          cursor?.moveToEdge('bottom')
          return
        case 'open':
          cursor?.open()
          return
        case 'delete':
          cursor?.remove()
          return
        case 'duplicate':
          cursor?.duplicate()
          return
        case 'escape':
          // Esc precedence: a focused field/edit owns Esc (its own handler
          // cancels), so only blur — never clear the cursor underneath it.
          // Otherwise clear the cursor, then fall back to blurring.
          if (fieldFocused) {
            blurActiveElement()
            return
          }
          if (cursor?.activeId) {
            cursor.clear()
            return
          }
          blurActiveElement()
          return
      }
    }

    function handleKeyDown(e: KeyboardEvent): void {
      if (isBlockingOverlayOpen()) return

      const fieldFocused = isEditableTarget(e.target)
      const { action, pending, mutating } = resolveIntent(e.key, {
        pending: pendingRef.current,
        fieldFocused,
      })

      clearPending()
      if (pending) {
        pendingRef.current = pending
        pendingTimerRef.current = setTimeout(clearPending, PENDING_TIMEOUT_MS)
      }

      if (action === 'none') return
      // Held keys never repeat-fire mutating actions; non-mutating nav still repeats.
      if (e.repeat && mutating) return

      e.preventDefault()
      dispatch(action, fieldFocused)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      clearPending()
    }
  }, [isDesktop])
}
