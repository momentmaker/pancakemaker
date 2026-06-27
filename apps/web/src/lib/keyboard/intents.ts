// Pure intent-mapper for the keyboard-shortcut system: (key, context) -> intent.
// No DOM access — fully unit-testable, and the single registration point that
// later phases (capture, palette, f-hints) extend.

export type KeyAction =
  | 'cursor-down'
  | 'cursor-up'
  | 'cursor-top'
  | 'cursor-bottom'
  | 'open'
  | 'delete'
  | 'duplicate'
  | 'go-dashboard'
  | 'go-personal'
  | 'go-business'
  | 'go-settings'
  | 'cheatsheet'
  | 'escape'
  | 'none'

// Prefix keys that begin a multi-key sequence (gg, g+route, yy). The hook tracks
// this token across keystrokes and feeds it back in via IntentContext.pending,
// keeping this resolver pure.
export type PendingPrefix = 'g' | 'y' | null

export interface IntentContext {
  pending?: PendingPrefix
  fieldFocused?: boolean
}

export interface Intent {
  action: KeyAction
  pending: PendingPrefix
  mutating: boolean
}

const MUTATING_ACTIONS: ReadonlySet<KeyAction> = new Set<KeyAction>(['delete', 'duplicate'])

export function isMutating(action: KeyAction): boolean {
  return MUTATING_ACTIONS.has(action)
}

function intent(action: KeyAction, pending: PendingPrefix = null): Intent {
  return { action, pending, mutating: isMutating(action) }
}

// Maps (not Records) so .get() is typed KeyAction | undefined — the unmapped-key
// guard below is then verified by the type checker rather than looking like dead code.
const G_SEQUENCE = new Map<string, KeyAction>([
  ['g', 'cursor-top'],
  ['d', 'go-dashboard'],
  ['p', 'go-personal'],
  ['b', 'go-business'],
  ['s', 'go-settings'],
])

const SINGLE_KEYS = new Map<string, KeyAction>([
  ['j', 'cursor-down'],
  ['k', 'cursor-up'],
  ['G', 'cursor-bottom'],
  ['o', 'open'],
  ['Enter', 'open'],
  ['d', 'delete'],
  ['?', 'cheatsheet'],
  ['Escape', 'escape'],
])

export function resolveIntent(key: string, context: IntentContext = {}): Intent {
  const { pending = null, fieldFocused = false } = context

  // While a field owns the keyboard, only Escape is honored and any pending
  // prefix is dropped (R3 / AE1).
  if (fieldFocused) {
    return key === 'Escape' ? intent('escape') : intent('none')
  }

  if (pending === 'g') {
    const action = G_SEQUENCE.get(key)
    return action ? intent(action) : intent('none')
  }

  if (pending === 'y') {
    return key === 'y' ? intent('duplicate') : intent('none')
  }

  if (key === 'g') return intent('none', 'g')
  if (key === 'y') return intent('none', 'y')

  const action = SINGLE_KEYS.get(key)
  return action ? intent(action) : intent('none')
}
