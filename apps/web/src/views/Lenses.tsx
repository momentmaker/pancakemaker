import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDatabase } from '../db/DatabaseContext'
import { useAppState } from '../hooks/useAppState'
import { useSync } from '../sync/SyncContext'
import { useRoutePrefix } from '../demo/demo-context'
import { getLenses, type LensSummary } from '../db/lenses'
import { formatCurrency } from '../lib/format'
import { EmptyState } from '../components/EmptyState'

export function formatLensTotals(lens: Pick<LensSummary, 'totals'>): string {
  return lens.totals.map((t) => formatCurrency(t.amount, t.currency)).join(' + ')
}

export function formatDateRange(first: string, last: string): string {
  const fmt = (d: string) =>
    new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
  return first === last ? fmt(first) : `${fmt(first)} – ${fmt(last)}`
}

export function Lenses() {
  const db = useDatabase()
  const { userId } = useAppState()
  const { dataVersion } = useSync()
  const prefix = useRoutePrefix()
  const [lenses, setLenses] = useState<LensSummary[] | null>(null)

  useEffect(() => {
    getLenses(db, userId)
      .then(setLenses)
      .catch((err: unknown) => console.error('Failed to load lenses:', err))
  }, [db, userId, dataVersion])

  return (
    <div>
      <h1 className="font-mono text-2xl font-bold text-neon-violet">Lenses</h1>
      <p className="mt-1 text-sm text-text-muted">
        What a trip, project or event really cost, across every category and month.
      </p>

      {lenses && lenses.length === 0 && (
        <div className="mt-6">
          <EmptyState message="Add +tags to expenses — like “45 ramen +japan-trip” in quick capture, or in a note — and each tag becomes a lens here." />
        </div>
      )}

      {lenses && lenses.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          {lenses.map((lens) => (
            <Link
              key={lens.name}
              to={`${prefix}/lens/${encodeURIComponent(lens.name)}`}
              className="flex items-center justify-between rounded-lg border border-border-dim bg-bg-card px-4 py-3 transition-colors hover:border-border-glow"
            >
              <div>
                <p className="font-mono text-sm text-neon-violet">+{lens.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-text-muted">
                  {lens.count} {lens.count === 1 ? 'expense' : 'expenses'} ·{' '}
                  {formatDateRange(lens.firstDate, lens.lastDate)}
                </p>
              </div>
              <span className="font-mono text-sm font-semibold text-text-primary">
                {formatLensTotals(lens)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
