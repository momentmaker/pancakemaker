import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { useDatabase } from '../db/DatabaseContext'
import { useAppState } from '../hooks/useAppState'
import { useExpenses } from '../hooks/useExpenses'
import { useCategories } from '../hooks/useCategories'
import { useExchangeRates } from '../hooks/useExchangeRates'
import {
  getPanelsByRoute,
  getCategoryMonthlyTrend,
  type PanelRow,
  type MonthlyTotal,
} from '../db/queries'
import { AmountDisplay } from '../components/AmountDisplay'
import { Button } from '../components/Button'
import { ExpenseRow } from '../components/ExpenseRow'
import { EmptyState } from '../components/EmptyState'
import { MonthPicker } from '../components/MonthPicker'
import { QuickAdd } from '../components/QuickAdd'
import { SparkBars } from '../components/SparkBars'

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'short' })
}

export function CategoryDetail() {
  const { categoryId } = useParams<{ categoryId: string }>()
  const location = useLocation()
  const routeType = location.pathname.startsWith('/business') ? 'business' : 'personal'
  const { userId, personalRouteId, businessRouteId, baseCurrency } = useAppState()
  const routeId = routeType === 'personal' ? personalRouteId : businessRouteId
  const db = useDatabase()

  const [month, setMonth] = useState(currentMonth)
  const [trend, setTrend] = useState<MonthlyTotal[]>([])
  const [panels, setPanels] = useState<PanelRow[]>([])
  const [allPanels, setAllPanels] = useState<PanelRow[]>([])
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(new Set())
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  const { categories, load: loadCategories } = useCategories(routeId)
  const { expenses, loading, load, add, update, remove } = useExpenses({
    categoryId: categoryId!,
    month,
  })
  const { convert } = useExchangeRates(baseCurrency)

  const category = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId],
  )

  const loadData = useCallback(async () => {
    load()
    const [trendData, allP] = await Promise.all([
      getCategoryMonthlyTrend(db, categoryId!, month),
      getPanelsByRoute(db, routeId, true),
    ])
    setTrend(trendData)
    setAllPanels(allP)
    setPanels(allP.filter((p) => p.is_archived === 0))
  }, [db, categoryId, month, routeId, load])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  useEffect(() => {
    loadData()
  }, [loadData])

  const panelMap = useMemo(() => {
    const map = new Map<string, PanelRow>()
    for (const p of allPanels) map.set(p.id, p)
    return map
  }, [allPanels])

  const panelGroups = useMemo(() => {
    const groups = new Map<string, typeof expenses>()
    for (const e of expenses) {
      const existing = groups.get(e.panel_id) ?? []
      existing.push(e)
      groups.set(e.panel_id, existing)
    }
    return Array.from(groups.entries()).map(([panelId, panelExpenses]) => {
      const panel = panelMap.get(panelId)
      const subtotal = panelExpenses.reduce((sum, e) => sum + e.amount, 0)
      const dateGroups = new Map<string, typeof expenses>()
      for (const e of panelExpenses) {
        const existing = dateGroups.get(e.date) ?? []
        existing.push(e)
        dateGroups.set(e.date, existing)
      }
      const sortedDates = Array.from(dateGroups.entries()).sort(([a], [b]) => b.localeCompare(a))
      return { panelId, panel, panelExpenses, subtotal, sortedDates }
    })
  }, [expenses, panelMap])

  const convertedTotal = useMemo(
    () => expenses.reduce((sum, e) => sum + convert(e.amount, e.currency), 0),
    [expenses, convert],
  )

  const sparkData = useMemo(
    () => trend.map((t) => ({ label: monthLabel(t.month), value: t.total })),
    [trend],
  )

  const defaultPanel = useMemo(
    () => panels.find((p) => p.is_default === 1) ?? panels[0],
    [panels],
  )

  const togglePanel = useCallback((panelId: string) => {
    setCollapsedPanels((prev) => {
      const next = new Set(prev)
      if (next.has(panelId)) next.delete(panelId)
      else next.add(panelId)
      return next
    })
  }, [])

  const handleAdd = useCallback(
    async (data: Parameters<typeof add>[0]) => {
      await add(data)
      const trendData = await getCategoryMonthlyTrend(db, categoryId!, month)
      setTrend(trendData)
    },
    [add, db, categoryId, month],
  )

  const handleRemove = useCallback(
    async (id: string) => {
      await remove(id)
      const trendData = await getCategoryMonthlyTrend(db, categoryId!, month)
      setTrend(trendData)
    },
    [remove, db, categoryId, month],
  )

  const handleUpdateAmount = useCallback(
    async (id: string, amount: number) => {
      await update(id, { amount })
      const trendData = await getCategoryMonthlyTrend(db, categoryId!, month)
      setTrend(trendData)
    },
    [update, db, categoryId, month],
  )

  const routeLabel = routeType.charAt(0).toUpperCase() + routeType.slice(1)

  if (!category) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Link to={`/${routeType}`} className="transition-colors hover:text-neon-cyan">
          {routeLabel}
        </Link>
        <span>/</span>
        <span className="text-text-primary">{category.name}</span>
      </div>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            <h1 className="font-mono text-2xl font-bold" style={{ color: category.color }}>
              {category.name}
            </h1>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <span style={{ color: category.color }}>
              <AmountDisplay amount={convertedTotal} currency={baseCurrency} size="md" />
            </span>
            <span className="text-xs text-text-muted">
              {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}
            </span>
          </div>
          <div className="mt-3">
            <MonthPicker month={month} onChange={setMonth} />
          </div>
        </div>
        <Button onClick={() => setShowQuickAdd(true)}>+ Add Expense</Button>
      </div>

      {sparkData.length > 0 && (
        <div className="mt-4">
          <SparkBars
            data={sparkData}
            color={category.color}
            currency={defaultPanel?.currency ?? 'USD'}
            highlightLast
          />
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent" />
          </div>
        ) : expenses.length === 0 ? (
          <EmptyState
            message="No expenses in this category yet"
            action="Add your first expense"
            onAction={() => setShowQuickAdd(true)}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {panelGroups.map(({ panelId, panel, panelExpenses, subtotal, sortedDates }) => {
              const collapsed = collapsedPanels.has(panelId)
              return (
                <div
                  key={panelId}
                  className="rounded-md border-l-2 pl-4"
                  style={{ borderLeftColor: category.color }}
                >
                  <button
                    onClick={() => togglePanel(panelId)}
                    className="flex w-full items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-text-primary">
                        {panel?.name ?? 'Unknown Panel'}
                      </span>
                      <span className="text-xs text-text-muted">
                        <AmountDisplay
                          amount={subtotal}
                          currency={panel?.currency ?? 'USD'}
                          size="sm"
                        />
                        {' · '}
                        {panelExpenses.length} {panelExpenses.length === 1 ? 'expense' : 'expenses'}
                      </span>
                    </div>
                    <span className="text-xs text-text-muted">
                      {collapsed ? '▸' : '▾'}
                    </span>
                  </button>

                  {!collapsed && (
                    <div className="flex flex-col gap-4 pb-2">
                      {sortedDates.map(([date, dateExpenses]) => (
                        <div key={date}>
                          <h3 className="mb-2 font-mono text-xs font-medium text-text-muted">
                            {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </h3>
                          <div className="flex flex-col gap-1">
                            {dateExpenses.map((expense) => (
                              <ExpenseRow
                                key={expense.id}
                                expense={expense}
                                onUpdateAmount={handleUpdateAmount}
                                onDelete={handleRemove}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowQuickAdd(true)}
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-neon-cyan text-bg-primary shadow-lg shadow-neon-cyan/20 transition-transform hover:scale-105 active:scale-95 sm:hidden"
        aria-label="Add expense"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <QuickAdd
        open={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        lockedCategoryId={categoryId}
        categories={categories}
        panels={panels}
        defaultPanelId={defaultPanel?.id}
        onAdd={handleAdd}
      />
    </div>
  )
}
