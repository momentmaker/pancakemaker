interface UndoToastProps {
  message: string | null
  onUndo: () => void
}

export function UndoToast({ message, onUndo }: UndoToastProps) {
  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 sm:bottom-4"
    >
      <div className="flex items-center gap-3 rounded-lg border border-neon-cyan/30 bg-bg-card px-4 py-2 font-mono text-sm shadow-lg">
        <span className="text-text-primary">{message}</span>
        <button
          onClick={onUndo}
          className="rounded px-2 py-0.5 text-xs font-semibold text-neon-cyan transition-colors hover:bg-neon-cyan/15"
        >
          Undo
        </button>
      </div>
    </div>
  )
}
