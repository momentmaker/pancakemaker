import { Modal } from './Modal'
import { KEYBOARD_BINDINGS } from '../lib/keyboard/bindings'

interface KeyboardCheatsheetProps {
  open: boolean
  onClose: () => void
}

export function KeyboardCheatsheet({ open, onClose }: KeyboardCheatsheetProps) {
  if (!open) return null

  return (
    <Modal open onClose={onClose} title="Keyboard shortcuts">
      <ul className="space-y-2 text-sm">
        {KEYBOARD_BINDINGS.map((binding) => (
          <li key={binding.keys} className="flex items-center justify-between gap-6">
            <span className="text-text-secondary">{binding.description}</span>
            <kbd className="whitespace-nowrap rounded border border-border-dim bg-bg-card px-2 py-0.5 font-mono text-xs text-neon-cyan">
              {binding.keys}
            </kbd>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
