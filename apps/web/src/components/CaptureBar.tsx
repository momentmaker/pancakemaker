import { useEffect, useRef, useState } from 'react'

interface CaptureBarProps {
  open: boolean
  routeLabel: string
  onSubmit: (input: string) => void | Promise<void>
  onClose: () => void
}

export function CaptureBar({ open, routeLabel, onSubmit, onClose }: CaptureBarProps) {
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
      <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl items-center gap-3">
        <span className="font-mono text-base font-semibold text-neon-cyan">:</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Add to ${routeLabel} — e.g. 12.50 coffee #meals`}
          aria-label={`Quick capture to ${routeLabel}`}
          className="flex-1 bg-transparent font-mono text-base text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        <span className="font-mono text-xs uppercase tracking-[0.15em] text-text-muted">
          {routeLabel}
        </span>
      </form>
    </div>
  )
}
