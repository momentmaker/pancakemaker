import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAppState } from '../hooks/useAppState'
import { useDatabase } from '../db/DatabaseContext'
import { useSync } from '../sync/SyncContext'
import { useRoutePrefix } from '../demo/demo-context'
import { useDashboardStats, type BurnRate } from '../hooks/useDashboardStats'
import {
  getPanelsByRoute,
  getCategoriesByRoute,
  createExpense,
  logSyncEntry,
  type PanelRow,
  type CategoryRow,
} from '../db/queries'
import { Card } from '../components/Card'
import { AmountDisplay } from '../components/AmountDisplay'
import { MonthPicker } from '../components/MonthPicker'
import { PancakeStack } from '../components/PancakeStack'
import { SparkBars } from '../components/SparkBars'
import { QuickAdd } from '../components/QuickAdd'
import { Button } from '../components/Button'

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getGreeting(): { line1: string; line2: string } {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12)
    return {
      line1: 'Rise & shine!',
      line2: 'Fresh pancakes on the griddle.',
    }
  if (hour >= 12 && hour < 17)
    return {
      line1: 'Afternoon check-in.',
      line2: "How's the stack looking?",
    }
  if (hour >= 17 && hour < 21)
    return {
      line1: 'Evening review time.',
      line2: "Let's see today's stack.",
    }
  return {
    line1: 'Late night pancaking?',
    line2: "We won't judge.",
  }
}

function getSpendingLevel(cents: number): { label: string; color: string } {
  const dollars = cents / 100
  if (dollars === 0) return { label: 'Your plate is clean!', color: 'text-text-muted' }
  if (dollars <= 50) return { label: 'Just a nibble', color: 'text-neon-lime' }
  if (dollars <= 200) return { label: 'Short stack', color: 'text-neon-cyan' }
  if (dollars <= 500) return { label: 'Full stack', color: 'text-neon-amber' }
  if (dollars <= 1000) return { label: 'Tall stack!', color: 'text-neon-orange' }
  return { label: 'Grand slam!', color: 'text-neon-magenta' }
}

function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function HeroPancake() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 512 512"
      fill="none"
      className="shrink-0"
      style={{ animation: 'float 3s ease-in-out infinite' }}
    >
      <defs>
        <linearGradient id="hero-cyan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00ffcc" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#00ccaa" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="hero-magenta" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff6b9d" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#cc4477" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="hero-amber" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#d49a10" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="hero-violet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#9955dd" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="hero-lime" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a3e635" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7dbb18" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="hero-syrup" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00ffcc" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#00ffcc" stopOpacity="0.15" />
        </linearGradient>
        <filter id="hero-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="hero-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="hero-outer" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="16" result="blur" />
          <feFlood floodColor="#00ffcc" floodOpacity="0.3" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse cx="256" cy="380" rx="160" ry="40" fill="#00ffcc" opacity="0.06" />
      <ellipse cx="256" cy="380" rx="120" ry="28" fill="#00ffcc" opacity="0.08" />
      <ellipse cx="256" cy="370" rx="150" ry="26" fill="#1a1a2e" opacity="0.8" />

      <g filter="url(#hero-glow)">
        <ellipse cx="256" cy="340" rx="138" ry="36" fill="#12121a" />
        <ellipse cx="256" cy="340" rx="138" ry="36" fill="url(#hero-amber)" opacity="0.35" />
        <ellipse
          cx="256"
          cy="340"
          rx="138"
          ry="36"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="1.5"
          opacity="0.8"
        />
      </g>
      <g filter="url(#hero-glow)">
        <ellipse cx="256" cy="298" rx="132" ry="34" fill="#12121a" />
        <ellipse cx="256" cy="298" rx="132" ry="34" fill="url(#hero-violet)" opacity="0.35" />
        <ellipse
          cx="256"
          cy="298"
          rx="132"
          ry="34"
          fill="none"
          stroke="#c084fc"
          strokeWidth="1.5"
          opacity="0.8"
        />
      </g>
      <g filter="url(#hero-glow)">
        <ellipse cx="256" cy="256" rx="126" ry="32" fill="#12121a" />
        <ellipse cx="256" cy="256" rx="126" ry="32" fill="url(#hero-magenta)" opacity="0.35" />
        <ellipse
          cx="256"
          cy="256"
          rx="126"
          ry="32"
          fill="none"
          stroke="#ff6b9d"
          strokeWidth="1.5"
          opacity="0.8"
        />
      </g>
      <g filter="url(#hero-glow)">
        <ellipse cx="256" cy="214" rx="120" ry="30" fill="#12121a" />
        <ellipse cx="256" cy="214" rx="120" ry="30" fill="url(#hero-lime)" opacity="0.35" />
        <ellipse
          cx="256"
          cy="214"
          rx="120"
          ry="30"
          fill="none"
          stroke="#a3e635"
          strokeWidth="1.5"
          opacity="0.8"
        />
      </g>
      <g filter="url(#hero-soft)">
        <ellipse cx="256" cy="172" rx="114" ry="28" fill="#12121a" />
        <ellipse cx="256" cy="172" rx="114" ry="28" fill="url(#hero-cyan)" opacity="0.4" />
        <ellipse
          cx="256"
          cy="172"
          rx="114"
          ry="28"
          fill="none"
          stroke="#00ffcc"
          strokeWidth="2"
          opacity="0.9"
        />
      </g>

      <path
        d="M168 185 Q162 220 170 260 Q174 280 166 300"
        stroke="url(#hero-syrup)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        filter="url(#hero-glow)"
      />
      <path
        d="M338 190 Q348 230 340 265 Q336 280 342 310 Q346 330 340 345"
        stroke="url(#hero-syrup)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        filter="url(#hero-glow)"
      />
      <path
        d="M306 178 Q312 200 308 220"
        stroke="url(#hero-syrup)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        filter="url(#hero-glow)"
      />

      <g filter="url(#hero-outer)">
        <rect x="236" y="148" width="40" height="12" rx="3" fill="#12121a" />
        <rect x="236" y="148" width="40" height="12" rx="3" fill="#00ffcc" opacity="0.25" />
        <rect
          x="236"
          y="148"
          width="40"
          height="12"
          rx="3"
          fill="none"
          stroke="#00ffcc"
          strokeWidth="1.5"
          opacity="0.7"
        />
      </g>
    </svg>
  )
}

const BURN_SEGMENTS: {
  key: keyof Pick<BurnRate, 'oneTime' | 'monthly' | 'annualMonthly'>
  label: string
  color: string
}[] = [
  { key: 'oneTime', label: 'One-time', color: '#00ffcc' },
  { key: 'monthly', label: 'Monthly', color: '#c084fc' },
  { key: 'annualMonthly', label: 'Annual/mo', color: '#fbbf24' },
]

function BurnRateCard({ burnRate, currency }: { burnRate: BurnRate; currency: string }) {
  const segments = BURN_SEGMENTS.filter((s) => burnRate[s.key] > 0)

  return (
    <Card className="mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono text-sm font-semibold text-text-secondary">Monthly Burn Rate</h2>
        <AmountDisplay amount={burnRate.total} currency={currency} size="md" />
      </div>

      {segments.length > 1 && (
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
          {segments.map((s) => (
            <div
              key={s.key}
              className="transition-all duration-300"
              style={{
                width: `${(burnRate[s.key] / burnRate.total) * 100}%`,
                backgroundColor: s.color,
                opacity: 0.7,
              }}
            />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="font-mono text-xs text-text-muted">{s.label}</span>
            <span className="font-mono text-xs text-text-secondary">
              <AmountDisplay amount={burnRate[s.key]} currency={currency} size="sm" />
            </span>
            {s.key === 'annualMonthly' && burnRate.annualYearly > 0 && (
              <span className="font-mono text-[10px] text-text-muted">
                (<AmountDisplay amount={burnRate.annualYearly} currency={currency} size="sm" />
                /yr)
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

function SpendingPaceCard({
  totalAmount,
  projectedTotal,
  prevMonthTotal,
  daysElapsed,
  daysInMonth,
  currency,
}: {
  totalAmount: number
  projectedTotal: number
  prevMonthTotal: number | null
  daysElapsed: number
  daysInMonth: number
  currency: string
}) {
  const dailyAverage = daysElapsed > 0 ? Math.round(totalAmount / daysElapsed) : 0
  const actualPct = Math.min((totalAmount / (projectedTotal || 1)) * 100, 100)
  const isOver = prevMonthTotal !== null && projectedTotal > prevMonthTotal
  const isUnder = prevMonthTotal !== null && projectedTotal <= prevMonthTotal
  const projectedColor = isOver
    ? 'text-neon-orange'
    : isUnder
      ? 'text-neon-cyan'
      : 'text-text-secondary'

  const prevPct =
    prevMonthTotal !== null && projectedTotal > 0
      ? Math.min((prevMonthTotal / projectedTotal) * 100, 100)
      : null

  return (
    <Card className="mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono text-sm font-semibold text-text-secondary">Spending Pace</h2>
        <div className={`font-mono ${projectedColor}`}>
          <AmountDisplay amount={projectedTotal} currency={currency} size="md" />
        </div>
      </div>

      <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-bg-primary/50">
        <div
          className="h-full rounded-full bg-neon-cyan/70 transition-all duration-500"
          style={{ width: `${actualPct}%` }}
        />
        {prevPct !== null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-text-muted/60"
            style={{ left: `${prevPct}%` }}
            title="Last month"
          />
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3 font-mono text-xs text-text-muted">
          <span>
            Day {daysElapsed} of {daysInMonth}
          </span>
          <span>·</span>
          <span>
            ~<AmountDisplay amount={dailyAverage} currency={currency} size="sm" />
            /day
          </span>
        </div>
        {prevMonthTotal !== null && (
          <span className="font-mono text-[10px] text-text-muted">
            last month: <AmountDisplay amount={prevMonthTotal} currency={currency} size="sm" />
          </span>
        )}
      </div>
    </Card>
  )
}

export function Dashboard() {
  const { userId, personalRouteId, businessRouteId, baseCurrency } = useAppState()
  const db = useDatabase()
  const { triggerSync, markPending } = useSync()
  const prefix = useRoutePrefix()
  const [month, setMonth] = useState(currentMonth)
  const { stats, loading, reload } = useDashboardStats(month)

  const [allPanels, setAllPanels] = useState<PanelRow[]>([])
  const [allCategories, setAllCategories] = useState<CategoryRow[]>([])
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  useEffect(() => {
    async function loadPanelsAndCategories() {
      const [pPanels, bPanels, pCats, bCats] = await Promise.all([
        getPanelsByRoute(db, personalRouteId),
        getPanelsByRoute(db, businessRouteId),
        getCategoriesByRoute(db, personalRouteId),
        getCategoriesByRoute(db, businessRouteId),
      ])
      setAllPanels([...pPanels, ...bPanels])
      setAllCategories([...pCats, ...bCats])
    }
    loadPanelsAndCategories()
  }, [db, personalRouteId, businessRouteId])

  const handleAdd = useCallback(
    async (data: {
      panelId: string
      categoryId: string
      amount: number
      currency: string
      date: string
      description?: string
    }) => {
      const expense = await createExpense(db, data)
      await logSyncEntry(
        db,
        userId,
        'expenses',
        expense.id,
        'create',
        expense as unknown as Record<string, unknown>,
      )
      markPending()
      triggerSync()
      reload()
    },
    [db, userId, markPending, triggerSync, reload],
  )

  const greeting = useMemo(getGreeting, [])
  const spendingLevel = stats ? getSpendingLevel(stats.totalAmount) : null

  const comparisonBadge = useMemo(() => {
    if (!stats?.prevMonthTotal) return null
    const delta = ((stats.totalAmount - stats.prevMonthTotal) / stats.prevMonthTotal) * 100
    const sign = delta >= 0 ? '+' : ''
    const color = delta >= 0 ? 'text-neon-orange' : 'text-neon-lime'
    return { text: `${sign}${Math.round(delta)}% vs last month`, color }
  }, [stats])

  const hasSpending = stats?.dayBreakdown.some((d) => d.value > 0) ?? false

  const panelRouteMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of allPanels) {
      map.set(p.id, p.route_id === personalRouteId ? 'personal' : 'business')
    }
    return map
  }, [allPanels, personalRouteId])

  return (
    <div>
      {/* Hero greeting */}
      <div className="flex items-center gap-5">
        <HeroPancake />
        <div className="min-w-0 flex-1">
          <h1 className="font-mono text-2xl font-bold text-neon-cyan">{greeting.line1}</h1>
          <p className="mt-0.5 text-sm text-text-secondary">{greeting.line2}</p>
        </div>
        <Button onClick={() => setShowQuickAdd(true)} className="hidden sm:flex">
          + Add
        </Button>
      </div>

      <div className="mt-4">
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {loading && !stats && (
        <div className="mt-8 flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
        </div>
      )}

      {stats && (
        <>
          {/* Stat cards */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Card glow>
              <p className="font-mono text-xs text-text-muted">Your Stack</p>
              <div className="mt-2 flex items-baseline gap-3">
                <AmountDisplay amount={stats.totalAmount} currency={baseCurrency} size="lg" />
                {comparisonBadge && (
                  <span className={`font-mono text-[10px] font-semibold ${comparisonBadge.color}`}>
                    {comparisonBadge.text}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="font-mono text-xs text-text-muted">
                  {stats.totalExpenses} {stats.totalExpenses === 1 ? 'pancake' : 'pancakes'}
                </span>
                {spendingLevel && (
                  <>
                    <span className="text-text-muted">·</span>
                    <span className={`font-mono text-xs font-semibold ${spendingLevel.color}`}>
                      {spendingLevel.label}
                    </span>
                  </>
                )}
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-neon-violet" />
                <p className="font-mono text-xs text-text-muted">Personal</p>
              </div>
              <div className="mt-2">
                <AmountDisplay amount={stats.personalAmount} currency={baseCurrency} size="lg" />
              </div>
              <Link
                to={`${prefix}/personal`}
                className="mt-2 inline-block font-mono text-[10px] text-text-muted transition-colors hover:text-neon-cyan"
              >
                View panels →
              </Link>
            </Card>
            <Card>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-neon-blue" />
                <p className="font-mono text-xs text-text-muted">Business</p>
              </div>
              <div className="mt-2">
                <AmountDisplay amount={stats.businessAmount} currency={baseCurrency} size="lg" />
              </div>
              <Link
                to={`${prefix}/business`}
                className="mt-2 inline-block font-mono text-[10px] text-text-muted transition-colors hover:text-neon-cyan"
              >
                View panels →
              </Link>
            </Card>
          </div>

          {/* Spending Pace */}
          {stats.projectedTotal !== null && stats.totalAmount > 0 && (
            <SpendingPaceCard
              totalAmount={stats.totalAmount}
              projectedTotal={stats.projectedTotal}
              prevMonthTotal={stats.prevMonthTotal}
              daysElapsed={stats.daysElapsed}
              daysInMonth={stats.dayBreakdown.length}
              currency={baseCurrency}
            />
          )}

          {/* Pancake Stack visualization */}
          {stats.categoryBreakdown.length > 0 ? (
            <Card className="mt-8">
              <h2 className="mb-2 text-center font-mono text-sm font-semibold text-text-secondary">
                Pancake Stack
              </h2>
              <p className="mb-4 text-center text-xs text-text-muted">
                Your top categories this month — hover to explore
              </p>
              <PancakeStack layers={stats.categoryBreakdown} currency={baseCurrency} />
            </Card>
          ) : (
            <Card className="mt-8">
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div style={{ animation: 'float 3s ease-in-out infinite' }}>
                  <svg width="64" height="64" viewBox="0 0 512 512" fill="none" opacity="0.4">
                    <defs>
                      <filter id="empty-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                    </defs>
                    <ellipse
                      cx="256"
                      cy="300"
                      rx="130"
                      ry="34"
                      fill="#12121a"
                      filter="url(#empty-glow)"
                    />
                    <ellipse
                      cx="256"
                      cy="300"
                      rx="130"
                      ry="34"
                      fill="none"
                      stroke="#555570"
                      strokeWidth="1.5"
                      strokeDasharray="8 6"
                    />
                    <ellipse
                      cx="256"
                      cy="260"
                      rx="120"
                      ry="30"
                      fill="#12121a"
                      filter="url(#empty-glow)"
                    />
                    <ellipse
                      cx="256"
                      cy="260"
                      rx="120"
                      ry="30"
                      fill="none"
                      stroke="#555570"
                      strokeWidth="1.5"
                      strokeDasharray="8 6"
                    />
                    <ellipse
                      cx="256"
                      cy="220"
                      rx="110"
                      ry="26"
                      fill="#12121a"
                      filter="url(#empty-glow)"
                    />
                    <ellipse
                      cx="256"
                      cy="220"
                      rx="110"
                      ry="26"
                      fill="none"
                      stroke="#555570"
                      strokeWidth="1.5"
                      strokeDasharray="8 6"
                    />
                  </svg>
                </div>
                <p className="mt-4 font-mono text-sm text-text-secondary">Your plate is empty!</p>
                <p className="mt-1 text-xs text-text-muted">
                  Start stacking some expenses to build your pancake.
                </p>
              </div>
            </Card>
          )}

          {/* Monthly Burn Rate */}
          {stats.burnRate.total > 0 && (
            <BurnRateCard burnRate={stats.burnRate} currency={baseCurrency} />
          )}

          {/* Daily Spending */}
          {hasSpending && (
            <Card className="mt-6">
              <h2 className="mb-3 font-mono text-sm font-semibold text-text-secondary">
                Daily Spending
              </h2>
              <SparkBars
                data={stats.dayBreakdown}
                color="#00ffcc"
                currency={baseCurrency}
                highlightLast={false}
              />
            </Card>
          )}

          {/* Biggest Pancake */}
          {stats.biggestExpense && (
            <Card className="mt-6 border-neon-amber/40">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-neon-amber">
                  Biggest Pancake
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <div>
                  <span className="font-mono text-sm text-text-primary">
                    {stats.biggestExpense.description || stats.biggestExpense.category_name}
                  </span>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: stats.biggestExpense.category_color }}
                    />
                    <span>{stats.biggestExpense.category_name}</span>
                    <span>·</span>
                    <span>{formatDate(stats.biggestExpense.date)}</span>
                    <span>·</span>
                    <Link
                      to={`${prefix}/${panelRouteMap.get(stats.biggestExpense.panel_id) ?? 'personal'}/panel/${stats.biggestExpense.panel_id}`}
                      className="transition-colors hover:text-neon-cyan"
                    >
                      {stats.biggestExpense.panel_name}
                    </Link>
                  </div>
                </div>
                <span className="text-neon-amber">
                  <AmountDisplay
                    amount={stats.biggestExpense.amount}
                    currency={stats.biggestExpense.currency}
                    size="md"
                  />
                </span>
              </div>
            </Card>
          )}

          {/* Recent Expenses */}
          {stats.recentExpenses.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 font-mono text-sm font-semibold text-text-secondary">
                Recent Expenses
              </h2>
              <div className="flex flex-col gap-1">
                {stats.recentExpenses.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-bg-card"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: e.category_color }}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm text-text-primary">
                          {e.description || e.category_name}
                        </p>
                        <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                          <span>{formatDate(e.date)}</span>
                          <span>·</span>
                          <Link
                            to={`${prefix}/${panelRouteMap.get(e.panel_id) ?? 'personal'}/panel/${e.panel_id}`}
                            className="transition-colors hover:text-neon-cyan"
                          >
                            {e.panel_name}
                          </Link>
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 pl-3 font-mono text-sm text-text-secondary">
                      <AmountDisplay amount={e.amount} currency={e.currency} size="sm" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Floating add button — mobile only */}
      <button
        onClick={() => setShowQuickAdd(true)}
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-neon-cyan text-bg-primary shadow-lg shadow-neon-cyan/20 transition-transform hover:scale-105 active:scale-95 sm:hidden"
        aria-label="Add expense"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <QuickAdd
        open={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        categories={allCategories}
        panels={allPanels}
        onAdd={handleAdd}
      />
    </div>
  )
}
