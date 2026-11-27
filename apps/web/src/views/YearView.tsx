import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDatabase } from '../db/DatabaseContext'
import { useAppState } from '../hooks/useAppState'
import { useSync } from '../sync/SyncContext'
import { useExchangeRates } from '../hooks/useExchangeRates'
import { useMonthScrub } from '../hooks/useMonthScrub'
import { useRoutePrefix } from '../demo/demo-context'
import {
  getYearCategoryTotals,
  getYearDailyTotals,
  type DailyTotalRow,
  type YearCategoryTotalRow,
} from '../db/year'
import { heatmapWeeks, intensityLevel, noSpendStats, yearOverYear } from '../lib/year'
import { summarizeUnconverted } from '../lib/currency'
import { formatCurrency } from '../lib/format'
import { AmountDisplay } from '../components/AmountDisplay'
import { Card } from '../components/Card'
import { SparkBars } from '../components/SparkBars'
import { UnconvertedNote } from '../components/UnconvertedNote'

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const LEVEL_OPACITY = [0, 0.25, 0.45, 0.7, 1]
const TOP_CATEGORIES = 8

function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

export function YearView() {
  const params = useParams<{ year: string }>()
  const year = params.year ?? String(new Date().getFullYear())
  const navigate = useNavigate()
  const prefix = useRoutePrefix()
  const db = useDatabase()
  const { personalRouteId, businessRouteId, baseCurrency } = useAppState()
  const { dataVersion } = useSync()
  const { convert, canConvert } = useExchangeRates(baseCurrency)

  useMonthScrub((delta) => navigate(`${prefix}/year/${Number(year) + delta}`))

  const [daily, setDaily] = useState<DailyTotalRow[]>([])
  const [previous, setPrevious] = useState<DailyTotalRow[]>([])
  const [categories, setCategories] = useState<YearCategoryTotalRow[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getYearDailyTotals(db, personalRouteId, businessRouteId, year),
      getYearDailyTotals(db, personalRouteId, businessRouteId, String(Number(year) - 1)),
      getYearCategoryTotals(db, personalRouteId, businessRouteId, year),
    ])
      .then(([d, p, c]) => {
        if (cancelled) return
        setDaily(d)
        setPrevious(p)
        setCategories(c)
      })
      .catch((err: unknown) => console.error(`Failed to load year ${year}:`, err))
    return () => {
      cancelled = true
    }
  }, [db, personalRouteId, businessRouteId, year, dataVersion])

  const spentByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of daily) {
      map.set(row.date, (map.get(row.date) ?? 0) + convert(row.total, row.currency))
    }
    return map
  }, [daily, convert])

  const total = useMemo(() => [...spentByDay.values()].reduce((a, b) => a + b, 0), [spentByDay])
  const previousTotal = useMemo(
    () => previous.reduce((sum, r) => sum + convert(r.total, r.currency), 0),
    [previous, convert],
  )
  const change = yearOverYear(total, previousTotal)

  const months = useMemo(() => {
    const sums = Array.from({ length: 12 }, () => 0)
    for (const [date, value] of spentByDay) sums[Number(date.slice(5, 7)) - 1] += value
    return sums.map((value, i) => ({ label: MONTH_LABELS[i], value }))
  }, [spentByDay])

  const topCategories = useMemo(() => {
    const map = new Map<string, { name: string; color: string; route: string; amount: number }>()
    for (const row of categories) {
      const entry = map.get(row.category_id) ?? {
        name: row.name,
        color: row.color,
        route: row.route_type,
        amount: 0,
      }
      entry.amount += convert(row.total, row.currency)
      map.set(row.category_id, entry)
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, TOP_CATEGORIES)
  }, [categories, convert])

  const weeks = useMemo(() => heatmapWeeks(year, spentByDay), [year, spentByDay])
  const maxDay = Math.max(...spentByDay.values(), 0)
  const streaks = noSpendStats(year, spentByDay, todayString())

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          to={`${prefix}/year/${Number(year) - 1}`}
          aria-label="Previous year"
          className="text-text-muted transition-colors hover:text-neon-cyan"
        >
          ‹
        </Link>
        <h1 className="font-mono text-2xl font-bold text-neon-cyan">{year} in pancakes</h1>
        <Link
          to={`${prefix}/year/${Number(year) + 1}`}
          aria-label="Next year"
          className="text-text-muted transition-colors hover:text-neon-cyan"
        >
          ›
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <AmountDisplay amount={total} currency={baseCurrency} size="lg" />
        {change !== null && (
          <span
            className={`font-mono text-xs font-semibold ${change > 0 ? 'text-neon-orange' : 'text-neon-cyan'}`}
          >
            {change > 0 ? '+' : ''}
            {change}% vs {Number(year) - 1}
          </span>
        )}
      </div>
      <UnconvertedNote summary={summarizeUnconverted(daily, canConvert)} />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-mono text-sm font-semibold text-text-secondary">By month</h2>
          <SparkBars data={months} color="#00ffcc" currency={baseCurrency} highlightLast={false} />
        </Card>
        <Card>
          <h2 className="font-mono text-sm font-semibold text-text-secondary">No-spend days</h2>
          <p className="mt-2 font-mono text-2xl font-semibold text-text-primary">
            {streaks.noSpendDays}
          </p>
          <p className="mt-1 font-mono text-xs text-text-muted">
            longest streak: {streaks.longestStreak} {streaks.longestStreak === 1 ? 'day' : 'days'}
          </p>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 font-mono text-sm font-semibold text-text-secondary">Every day</h2>
        <div className="overflow-x-auto">
          <div className="flex gap-[3px]" role="img" aria-label={`Daily spending in ${year}`}>
            {weeks.map((week, w) => (
              <div key={w} className="flex flex-col gap-[3px]">
                {week.map((day, d) =>
                  day ? (
                    <div
                      key={d}
                      title={`${day.date}: ${formatCurrency(day.value, baseCurrency)}`}
                      className="h-2.5 w-2.5 rounded-sm bg-neon-cyan"
                      style={{
                        opacity: LEVEL_OPACITY[intensityLevel(day.value, maxDay)] || 0.06,
                      }}
                    />
                  ) : (
                    <div key={d} className="h-2.5 w-2.5" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {topCategories.length > 0 && (
        <Card className="mt-4">
          <h2 className="mb-3 font-mono text-sm font-semibold text-text-secondary">
            Top categories
          </h2>
          <div className="flex flex-col gap-2">
            {topCategories.map((c) => (
              <div key={`${c.route}-${c.name}`}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-text-secondary">
                    {c.name}
                    <span className="ml-1.5 font-mono text-[10px] text-text-muted">{c.route}</span>
                  </span>
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
      )}
    </div>
  )
}
