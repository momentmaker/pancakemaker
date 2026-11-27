import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDatabase } from '../db/DatabaseContext'
import { useAppState } from '../hooks/useAppState'
import { useSync } from '../sync/SyncContext'
import { useExchangeRates } from '../hooks/useExchangeRates'
import { useRoutePrefix } from '../demo/demo-context'
import { getLensExpenses, type LensExpenseRow } from '../db/lenses'
import { summarizeUnconverted } from '../lib/currency'
import { AmountDisplay } from '../components/AmountDisplay'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { UnconvertedNote } from '../components/UnconvertedNote'
import { formatDateRange } from './Lenses'

interface CategoryShare {
  name: string
  color: string
  amount: number
}

export function Lens() {
  const { name = '' } = useParams<{ name: string }>()
  const db = useDatabase()
  const { userId, baseCurrency } = useAppState()
  const { dataVersion } = useSync()
  const { convert, canConvert } = useExchangeRates(baseCurrency)
  const prefix = useRoutePrefix()
  const [rows, setRows] = useState<LensExpenseRow[] | null>(null)

  useEffect(() => {
    getLensExpenses(db, userId, name)
      .then(setRows)
      .catch((err: unknown) => console.error(`Failed to load lens +${name}:`, err))
  }, [db, userId, name, dataVersion])

  const total = useMemo(
    () => (rows ?? []).reduce((sum, r) => sum + convert(r.amount, r.currency), 0),
    [rows, convert],
  )

  const byCategory = useMemo<CategoryShare[]>(() => {
    const map = new Map<string, CategoryShare>()
    for (const r of rows ?? []) {
      const share = map.get(r.category_id) ?? {
        name: r.category_name,
        color: r.category_color,
        amount: 0,
      }
      share.amount += convert(r.amount, r.currency)
      map.set(r.category_id, share)
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount)
  }, [rows, convert])

  const dates = (rows ?? []).map((r) => r.date).sort()

  return (
    <div>
      <Link
        to={`${prefix}/lenses`}
        className="font-mono text-xs text-text-muted transition-colors hover:text-neon-violet"
      >
        ← Lenses
      </Link>
      <h1 className="mt-2 font-mono text-2xl font-bold text-neon-violet">+{name}</h1>

      {rows && rows.length === 0 && (
        <div className="mt-6">
          <EmptyState message={`No expenses tagged +${name} yet.`} />
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="mt-2 flex items-baseline gap-3">
            <AmountDisplay amount={total} currency={baseCurrency} size="lg" />
            <span className="font-mono text-xs text-text-muted">
              {rows.length} {rows.length === 1 ? 'expense' : 'expenses'} ·{' '}
              {formatDateRange(dates[0], dates[dates.length - 1])}
            </span>
          </div>
          <UnconvertedNote summary={summarizeUnconverted(rows, canConvert)} />

          <Card className="mt-6">
            <h2 className="mb-3 font-mono text-sm font-semibold text-text-secondary">
              By category
            </h2>
            <div className="flex flex-col gap-2">
              {byCategory.map((c) => (
                <div key={c.name}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-text-secondary">{c.name}</span>
                    <AmountDisplay amount={c.amount} currency={baseCurrency} size="sm" />
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-primary/50">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${total > 0 ? (c.amount / total) * 100 : 0}%`,
                        backgroundColor: c.color,
                        opacity: 0.7,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="mt-6 flex flex-col gap-1">
            {rows.map((r) => (
              <Link
                key={r.id}
                to={`${prefix}/${r.route_type}/panel/${r.panel_id}`}
                className="flex items-center justify-between rounded-md border border-border-dim bg-bg-card px-4 py-2.5 transition-colors hover:border-border-glow"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-text-primary">
                    {r.description || r.category_name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-text-muted">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: r.category_color }}
                    />
                    {r.category_name} · {r.panel_name} · {r.date}
                  </p>
                </div>
                <AmountDisplay amount={r.amount} currency={r.currency} size="sm" />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
