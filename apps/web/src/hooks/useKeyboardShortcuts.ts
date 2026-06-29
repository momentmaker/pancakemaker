import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIsDesktop } from './useIsDesktop.js'
import { useKeyboardCursor } from './useKeyboardCursor.js'
import { useCapture } from './useCapture.js'
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
  const capture = useCapture()

  const navigateRef = useRef(navigate)
  const prefixRef = useRef(routePrefix)
  const cheatsheetRef = useRef(onCheatsheet)
  const cursorRef = useRef(cursor)
  const captureRef = useRef(capture)
  navigateRef.current = navigate
  prefixRef.current = routePrefix
  cheatsheetRef.current = onCheatsheet
  cursorRef.current = cursor
  captureRef.current = capture

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

    // Returns true when the shortcut consumed the key, so the caller suppresses
    // the browser default (e.g. Enter activating a focused button). Exhaustive
    // over every non-'none' action: a new KeyAction is a compile error here until
    // it is wired up.
    function dispatch(action: Exclude<KeyAction, 'none'>, fieldFocused: boolean): boolean {
      const cursor = cursorRef.current
      switch (action) {
        case 'go-dashboard':
        case 'go-personal':
        case 'go-business':
        case 'go-settings': {
          const routePath = ROUTE_PATHS.get(action)
          if (routePath !== undefined) navigateRef.current(`${prefixRef.current}${routePath}`)
          return true
        }
        case 'cheatsheet':
          cheatsheetRef.current()
          return true
        case 'open-quick-add':
          captureRef.current?.openQuickAdd()
          return true
        case 'cursor-down':
          cursor?.move(1)
          return true
        case 'cursor-up':
          cursor?.move(-1)
          return true
        case 'cursor-top':
          cursor?.moveToEdge('top')
          return true
        case 'cursor-bottom':
          cursor?.moveToEdge('bottom')
          return true
        case 'open':
        case 'delete':
        case 'duplicate':
          // Only consume item actions when the cursor is on an item; otherwise
          // leave the event alone so e.g. Enter still activates a focused button.
          if (!cursor?.activeId) return false
          if (action === 'open') cursor.open()
          else if (action === 'delete') cursor.remove()
          else cursor.duplicate()
          return true
        case 'escape':
          // A focused field owns Esc — its own handler cancels the edit. Blurring
          // here would fire the field's save-on-blur and commit the very edit the
          // user is cancelling, so stand down entirely while a field is focused.
          if (fieldFocused) return false
          if (cursor?.activeId) {
            cursor.clear()
            return true
          }
          blurActiveElement()
          return false
        default: {
          const exhaustive: never = action
          return exhaustive
        }
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

      // Only suppress the browser default when the shortcut actually consumed the key.
      if (dispatch(action, fieldFocused)) e.preventDefault()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      clearPending()
    }
  }, [isDesktop])
}
