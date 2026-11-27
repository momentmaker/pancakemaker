import { Link } from 'react-router-dom'
import { AmountDisplay } from './AmountDisplay'
import { useRoutePrefix } from '../demo/demo-context'
import { formatCurrency } from '../lib/format'
import type { UpcomingCharge } from '../db/renewals'

function formatDueDate(date: string, daysUntil: number): string {
  const label = new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const when = daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`
  return `${label} · ${when}`
}

interface UpcomingChargeRowProps {
  charge: UpcomingCharge
  showWindowTotal?: boolean
}

export function UpcomingChargeRow({ charge, showWindowTotal = false }: UpcomingChargeRowProps) {
  const prefix = useRoutePrefix()
  const change = charge.priceChange
  const wentUp = change !== null && change.to > change.from

  return (
    <Link
      to={`${prefix}/${charge.routeType}/panel/${charge.panelId}`}
      className="flex items-center justify-between gap-3 rounded-md border border-border-dim bg-bg-card px-4 py-2.5 transition-colors hover:border-border-glow"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: charge.categoryColor }}
          />
          <span className="truncate text-sm text-text-primary">{charge.name}</span>
          {charge.recurrenceType === 'annual' && (
            <span className="rounded bg-neon-violet/15 px-1.5 py-0.5 font-mono text-[10px] text-neon-violet">
              annual
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-text-muted">
          <span>{formatDueDate(charge.nextDate, charge.daysUntil)}</span>
          {change && (
            <span className={wentUp ? 'text-neon-amber' : 'text-neon-lime'}>
              {wentUp ? '↑' : '↓'} was {formatCurrency(change.from, charge.currency)}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <AmountDisplay amount={charge.amount} currency={charge.currency} size="sm" />
        {showWindowTotal && charge.chargesInWindow > 1 && (
          <p className="font-mono text-[10px] text-text-muted">
            ×{charge.chargesInWindow} · {formatCurrency(charge.totalInWindow, charge.currency)}
          </p>
        )}
      </div>
    </Link>
  )
}
