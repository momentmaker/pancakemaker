interface EmptyStateProps {
  message: string
  action?: string
  onAction?: () => void
}

export function EmptyState({ message, action, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-dim px-6 py-12 text-center">
      <p className="text-sm text-text-muted">{message}</p>
      {action && onAction && (
        <button
          onClick={onAction}
          className="text-sm font-medium text-neon-cyan transition-colors hover:text-neon-cyan/80"
        >
          {action}
        </button>
      )}
    </div>
  )
}
