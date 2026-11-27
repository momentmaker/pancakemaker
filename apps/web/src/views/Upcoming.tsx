import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppState } from '../hooks/useAppState'
import { useExchangeRates } from '../hooks/useExchangeRates'
import { useRenewalRadar } from '../hooks/useRenewalRadar'
import { useRoutePrefix } from '../demo/demo-context'
import { AmountDisplay } from '../components/AmountDisplay'
import { EmptyState } from '../components/EmptyState'
import { UpcomingChargeRow } from '../components/UpcomingChargeRow'

const WINDOWS = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'Year' },
] as const

function formatEndDate(date: string): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function Upcoming() {
  const { baseCurrency } = useAppState()
  const { convert } = useExchangeRates(baseCurrency)
  const prefix = useRoutePrefix()
  const [windowDays, setWindowDays] = useState<number>(30)
  const radar = useRenewalRadar(windowDays)

  const totalDue = useMemo(
    () => (radar?.upcoming ?? []).reduce((sum, c) => sum + convert(c.totalInWindow, c.currency), 0),
    [radar, convert],
  )

  return (
    <div>
      <h1 className="font-mono text-2xl font-bold text-neon-cyan">Upcoming</h1>
      <p className="mt-1 text-sm text-text-muted">What your recurring expenses will charge next.</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div role="group" aria-label="Time window" className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onClick={() => setWindowDays(w.days)}
              aria-pressed={windowDays === w.days}
              className={`rounded-md px-3 py-1 font-mono text-xs transition-colors ${
                windowDays === w.days
                  ? 'bg-neon-cyan/15 text-neon-cyan'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        {radar && radar.upcoming.length > 0 && (
          <div className="text-right">
            <p className="font-mono text-[10px] text-text-muted">Due in window</p>
            <AmountDisplay amount={totalDue} currency={baseCurrency} size="md" />
          </div>
        )}
      </div>

      {radar && radar.upcoming.length === 0 && radar.ended.length === 0 && (
        <div className="mt-6">
          <EmptyState message="Nothing repeating yet. Expenses in your Monthly and Annual panels show up here before they're charged." />
        </div>
      )}

      {radar && radar.upcoming.length > 0 && (
        <div className="mt-4 flex flex-col gap-1">
          {radar.upcoming.map((charge) => (
            <UpcomingChargeRow key={charge.seriesId} charge={charge} showWindowTotal />
          ))}
        </div>
      )}

      {radar && radar.ended.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-mono text-sm font-semibold text-text-secondary">
            Recently ended
          </h2>
          <div className="flex flex-col gap-1">
            {radar.ended.map((series) => (
              <Link
                key={series.seriesId}
                to={`${prefix}/${series.routeType}/panel/${series.panelId}`}
                className="flex items-center justify-between rounded-md border border-border-dim px-4 py-2 text-text-muted transition-colors hover:border-border-glow"
              >
                <span className="text-sm line-through">{series.name}</span>
                <span className="font-mono text-[11px]">ended {formatEndDate(series.endDate)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
