import { Card } from './Card'
import { AmountDisplay } from './AmountDisplay'
import { formatCurrency } from '../lib/format'
import { ghostDelta } from '../lib/pace'

interface SpendingPaceCardProps {
  totalAmount: number
  projectedTotal: number
  daysElapsed: number
  daysInMonth: number
  currency: string
  paceCurve: number[]
  ghostCurve: number[] | null
  ghostLabel: string | null
}

const CHART_WIDTH = 300
const CHART_HEIGHT = 64

// Starts at zero before day 1, so a bill on the 1st shows as a steep rise.
function toPoints(curve: readonly number[], daysInMonth: number, max: number): string {
  return [0, ...curve]
    .map((value, day) => {
      const x = (day / daysInMonth) * CHART_WIDTH
      const y = CHART_HEIGHT - (max > 0 ? (value / max) * (CHART_HEIGHT - 4) : 0) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function headline(
  delta: number | null,
  day: number,
  label: string | null,
  currency: string,
): { text: string; color: string } | null {
  if (delta === null || label === null) return null
  if (delta === 0) return { text: `Day ${day}: even with ${label}`, color: 'text-text-secondary' }
  const direction = delta < 0 ? 'under' : 'over'
  return {
    text: `Day ${day}: ${formatCurrency(Math.abs(delta), currency)} ${direction} ${label}`,
    color: delta < 0 ? 'text-neon-cyan' : 'text-neon-orange',
  }
}

export function SpendingPaceCard({
  totalAmount,
  projectedTotal,
  daysElapsed,
  daysInMonth,
  currency,
  paceCurve,
  ghostCurve,
  ghostLabel,
}: SpendingPaceCardProps) {
  const dailyAverage = daysElapsed > 0 ? Math.round(totalAmount / daysElapsed) : 0
  const comparison = headline(
    ghostDelta(paceCurve, ghostCurve, daysElapsed),
    daysElapsed,
    ghostLabel,
    currency,
  )
  const max = Math.max(...paceCurve, ...(ghostCurve ?? []), 1)
  return (
    <Card className="mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono text-sm font-semibold text-text-secondary">Spending Pace</h2>
        <div className="text-right">
          <p className="font-mono text-[10px] text-text-muted">projected</p>
          <AmountDisplay amount={projectedTotal} currency={currency} size="md" />
        </div>
      </div>

      {comparison && (
        <p className={`mt-1 font-mono text-xs font-semibold ${comparison.color}`}>
          {comparison.text}
        </p>
      )}

      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="mt-3 h-16 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={
          ghostLabel
            ? `This month's running total against ${ghostLabel}`
            : "This month's running total"
        }
      >
        {ghostCurve && (
          <polyline
            points={toPoints(ghostCurve, daysInMonth, max)}
            fill="none"
            stroke="currentColor"
            className="text-text-muted/50"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polyline
          points={toPoints(paceCurve, daysInMonth, max)}
          fill="none"
          stroke="currentColor"
          className="text-neon-cyan"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-2 flex items-center justify-between font-mono text-xs text-text-muted">
        <div className="flex items-center gap-3">
          <span>
            Day {daysElapsed} of {daysInMonth}
          </span>
          <span>·</span>
          <span>
            ~<AmountDisplay amount={dailyAverage} currency={currency} size="sm" />
            /day
          </span>
        </div>
        {ghostLabel && <span className="text-[10px]">- - - {ghostLabel}</span>}
      </div>
    </Card>
  )
}
