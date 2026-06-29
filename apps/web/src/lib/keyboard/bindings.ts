// Display source for the cheatsheet. Kept alongside the intent-mapper so the
// advertised keys stay in step with what resolveIntent actually handles — the
// deferred `/` is intentionally absent here and in the mapper.

export interface KeyBinding {
  keys: string
  description: string
}

export const KEYBOARD_BINDINGS: KeyBinding[] = [
  { keys: 'j / k', description: 'Move cursor down / up' },
  { keys: 'g g', description: 'Jump to first item' },
  { keys: 'G', description: 'Jump to last item' },
  { keys: 'Enter / o', description: 'Open or edit the cursored item' },
  { keys: 'd', description: 'Delete the cursored expense' },
  { keys: 'y y', description: 'Duplicate the cursored expense' },
  { keys: 'g d', description: 'Go to Dashboard' },
  { keys: 'g p', description: 'Go to Personal' },
  { keys: 'g b', description: 'Go to Business' },
  { keys: 'g s', description: 'Go to Settings' },
  { keys: 'a', description: 'Add an expense (Quick Add)' },
  { keys: '?', description: 'Show this cheatsheet' },
  { keys: 'Esc', description: 'Clear cursor / close' },
]
