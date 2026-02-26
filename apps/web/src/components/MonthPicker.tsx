interface MonthPickerProps {
  month: string
  onChange: (month: string) => void
}

function formatMonth(month: string): string {
  const [year, m] = month.split('-')
  const date = new Date(parseInt(year), parseInt(m) - 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function addMonths(month: string, delta: number): string {
  const [year, m] = month.split('-')
  const date = new Date(parseInt(year), parseInt(m) - 1 + delta)
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${mo}`
}

export function MonthPicker({ month, onChange }: MonthPickerProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(addMonths(month, -1))}
        className="rounded p-1 text-text-muted transition-colors hover:text-neon-cyan"
        aria-label="Previous month"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M12 15l-5-5 5-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span className="min-w-[160px] text-center font-mono text-sm text-text-primary">
        {formatMonth(month)}
      </span>
      <button
        onClick={() => onChange(addMonths(month, 1))}
        className="rounded p-1 text-text-muted transition-colors hover:text-neon-cyan"
        aria-label="Next month"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M8 5l5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}
