import { useEffect } from 'react'

export interface CaptureToastSummary {
  route: string
  category: string
  amount: string
}

interface CaptureToastProps {
  summary: CaptureToastSummary | null
  onDismiss: () => void
  durationMs?: number
}

const TOAST_DURATION_MS = 3000

export function CaptureToast({
  summary,
  onDismiss,
  durationMs = TOAST_DURATION_MS,
}: CaptureToastProps) {
  useEffect(() => {
    if (!summary) return
    const timer = setTimeout(onDismiss, durationMs)
    const dismiss = () => onDismiss()
    window.addEventListener('keydown', dismiss)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', dismiss)
    }
  }, [summary, onDismiss, durationMs])

  if (!summary) return null

  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-lg border border-neon-cyan/30 bg-bg-card px-4 py-2 font-mono text-sm shadow-lg">
        <span className="text-neon-cyan">Added</span>
        <span className="text-text-primary">
          {summary.route} · {summary.category} · {summary.amount}
        </span>
      </div>
    </div>
  )
}
