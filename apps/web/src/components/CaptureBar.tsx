import { useEffect, useRef, useState } from 'react'

export interface UsualChip {
  key: string
  label: string
  detail: string
}

interface CaptureBarProps {
  open: boolean
  routeLabel: string
  onSubmit: (input: string) => void | Promise<void>
  onClose: () => void
  usuals?: UsualChip[]
  onPickUsual?: (key: string) => void
  onMore?: (input: string) => void
}

export function CaptureBar({
  open,
  routeLabel,
  onSubmit,
  onClose,
  usuals = [],
  onPickUsual,
  onMore,
}: CaptureBarProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue('')
      inputRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      data-kbd-popover-open
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border-dim bg-bg-secondary/95 px-4 py-3 backdrop-blur-sm"
    >
      <div className="mx-auto max-w-2xl">
        {usuals.length > 0 && onPickUsual && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1" aria-label="Your usuals">
            {usuals.map((u) => (
              <button
                key={u.key}
                type="button"
                onClick={() => onPickUsual(u.key)}
                className="shrink-0 rounded-full border border-border-dim bg-bg-card px-3 py-1 text-left transition-colors hover:border-neon-cyan/50"
              >
                <span className="text-xs text-text-primary">{u.label}</span>
                <span className="ml-1.5 font-mono text-[10px] text-text-muted">{u.detail}</span>
              </button>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <span className="font-mono text-base font-semibold text-neon-cyan">:</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Add to ${routeLabel} — e.g. 12.50 coffee #meals`}
            aria-label={`Quick capture to ${routeLabel}`}
            enterKeyHint="done"
            className="min-w-0 flex-1 bg-transparent font-mono text-base text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <span className="hidden font-mono text-xs uppercase tracking-[0.15em] text-text-muted sm:inline">
            {routeLabel}
          </span>
          {onMore && (
            <button
              type="button"
              onClick={() => onMore(value)}
              className="shrink-0 font-mono text-xs text-text-muted transition-colors hover:text-neon-cyan"
            >
              More…
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close capture"
            className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
          >
            ✕
          </button>
        </form>
      </div>
    </div>
  )
}
