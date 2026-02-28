import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useDatabase } from '../db/DatabaseContext.js'
import { useAppState } from './useAppState.js'
import { useSync } from '../sync/SyncContext.js'
import { useExchangeRates } from './useExchangeRates.js'
import {
  getDashboardExpenses,
  getDashboardRecentExpenses,
  getCategoryMonthlyTrend,
  getDashboardYearTotals,
  type DashboardExpenseRow,
  type DashboardRecentExpenseRow,
  type MonthlyTotal,
} from '../db/queries.js'

interface CategorySpend {
  id: string
  name: string
  color: string
  amount: number
}

export interface BurnRate {
  oneTime: number
  monthly: number
  annualMonthly: number
  annualYearly: number
  total: number
}

export interface YtdStats {
  yearTotal: number
  monthlyAvg: number
  monthlyTotals: { label: string; value: number }[]
  bestMonth: { label: string; total: number } | null
  lightestMonth: { label: string; total: number } | null
}

export interface DashboardStats {
  totalExpenses: number
  totalAmount: number
  personalAmount: number
  businessAmount: number
  categoryBreakdown: CategorySpend[]
  prevMonthTotal: number | null
  dayBreakdown: { label: string; value: number }[]
  recentExpenses: DashboardRecentExpenseRow[]
  biggestExpense: DashboardRecentExpenseRow | null
  burnRate: BurnRate
  daysElapsed: number
  projectedTotal: number | null
  categoryTrends: Map<string, { label: string; value: number }[]>
  insights: string[]
  ytdStats: YtdStats
}

function previousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const d = new Date(year, m - 1 - 1)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${mo}`
}

function daysInMonth(month: string): number {
  const [year, m] = month.split('-').map(Number)
  return new Date(year, m, 0).getDate()
}

function computeDaysElapsed(month: string, override?: number): number {
  if (override !== undefined) return override
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (month === currentMonth) return now.getDate()
  if (month < currentMonth) return daysInMonth(month)
  return 0
}

function aggregateExpenses(
  expenses: DashboardExpenseRow[],
  personalRouteId: string,
  convert: (amount: number, currency: string) => number,
): Pick<
  DashboardStats,
  'totalAmount' | 'personalAmount' | 'businessAmount' | 'totalExpenses' | 'categoryBreakdown'
> {
  let personalAmount = 0
  let businessAmount = 0
  const categoryMap = new Map<string, { name: string; color: string; amount: number }>()

  for (const e of expenses) {
    const converted = convert(e.amount, e.currency)
    if (e.route_id === personalRouteId) {
      personalAmount += converted
    } else {
      businessAmount += converted
    }

    const existing = categoryMap.get(e.category_id)
    if (existing) {
      existing.amount += converted
    } else {
      categoryMap.set(e.category_id, {
        name: e.category_name,
        color: e.category_color,
        amount: converted,
      })
    }
  }

  const sorted = Array.from(categoryMap.entries())
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 10)

  const categoryBreakdown = sorted.map(([id, data]) => ({ id, ...data }))

  return {
    totalExpenses: expenses.length,
    totalAmount: personalAmount + businessAmount,
    personalAmount,
    businessAmount,
    categoryBreakdown,
  }
}

function buildDayBreakdown(
  expenses: DashboardExpenseRow[],
  month: string,
  convert: (amount: number, currency: string) => number,
): { label: string; value: number }[] {
  const days = daysInMonth(month)
  const daySums = new Map<string, number>()

  for (const e of expenses) {
    const day = e.date.slice(8, 10)
    daySums.set(day, (daySums.get(day) ?? 0) + convert(e.amount, e.currency))
  }

  const result: { label: string; value: number }[] = []
  for (let d = 1; d <= days; d++) {
    const dayStr = String(d).padStart(2, '0')
    result.push({ label: String(d), value: daySums.get(dayStr) ?? 0 })
  }
  return result
}

function computeBurnRate(
  expenses: DashboardExpenseRow[],
  convert: (amount: number, currency: string) => number,
): BurnRate {
  let oneTime = 0
  let monthly = 0
  let annualYearly = 0

  for (const e of expenses) {
    const converted = convert(e.amount, e.currency)
    switch (e.panel_recurrence_type) {
      case 'monthly':
        monthly += converted
        break
      case 'annual':
        annualYearly += converted
        break
      default:
        oneTime += converted
        break
    }
  }

  const annualMonthly = Math.round(annualYearly / 12)
  return {
    oneTime,
    monthly,
    annualMonthly,
    annualYearly,
    total: oneTime + monthly + annualMonthly,
  }
}

function deriveInsights(
  categoryBreakdown: CategorySpend[],
  prevExpenses: DashboardExpenseRow[],
  dayBreakdown: { label: string; value: number }[],
  personalRouteId: string,
  convert: (amount: number, currency: string) => number,
): string[] {
  const insights: string[] = []

  const prevCategoryMap = new Map<string, number>()
  for (const e of prevExpenses) {
    const converted = convert(e.amount, e.currency)
    prevCategoryMap.set(e.category_name, (prevCategoryMap.get(e.category_name) ?? 0) + converted)
  }

  let biggestDelta = { name: '', pct: 0 }
  for (const cat of categoryBreakdown) {
    const prev = prevCategoryMap.get(cat.name)
    if (prev && prev > 0) {
      const pct = Math.round(((cat.amount - prev) / prev) * 100)
      if (Math.abs(pct) > Math.abs(biggestDelta.pct) && Math.abs(pct) >= 20) {
        biggestDelta = { name: cat.name, pct }
      }
    }
  }
  if (biggestDelta.name) {
    const direction = biggestDelta.pct > 0 ? 'up' : 'down'
    insights.push(
      `${biggestDelta.name} is ${direction} ${Math.abs(biggestDelta.pct)}% vs last month`,
    )
  }

  const noSpendDays = dayBreakdown.filter((d) => d.value === 0).length
  if (noSpendDays > 0) {
    insights.push(`${noSpendDays} no-spend ${noSpendDays === 1 ? 'day' : 'days'} this month`)
  }

  const biggestDay = dayBreakdown.reduce(
    (max, d) => (d.value > max.value ? d : max),
    dayBreakdown[0],
  )
  if (biggestDay && biggestDay.value > 0) {
    insights.push(`Day ${biggestDay.label} was your biggest spending day`)
  }

  return insights.slice(0, 3)
}

export function useDashboardStats(month: string, daysElapsedOverride?: number) {
  const db = useDatabase()
  const { personalRouteId, businessRouteId, baseCurrency } = useAppState()
  const { dataVersion } = useSync()
  const { convert } = useExchangeRates(baseCurrency)

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(false)
  const lastMonthRef = useRef('')

  const loadStats = useCallback(async () => {
    const isNewMonth = month !== lastMonthRef.current
    if (isNewMonth) setLoading(true)

    try {
      const prevMonth = previousMonth(month)
      const [currentExpenses, prevExpenses, recentExpenses] = await Promise.all([
        getDashboardExpenses(db, personalRouteId, businessRouteId, month),
        getDashboardExpenses(db, personalRouteId, businessRouteId, prevMonth),
        getDashboardRecentExpenses(db, personalRouteId, businessRouteId),
      ])

      const current = aggregateExpenses(currentExpenses, personalRouteId, convert)

      const prevTotal = prevExpenses.reduce((sum, e) => sum + convert(e.amount, e.currency), 0)

      const dayBreakdown = buildDayBreakdown(currentExpenses, month, convert)
      const burnRate = computeBurnRate(currentExpenses, convert)

      const top5Ids = current.categoryBreakdown.slice(0, 5).map((c) => c.id)
      const trendResults = await Promise.all(
        top5Ids.map((id) => getCategoryMonthlyTrend(db, id, month, 6)),
      )
      const categoryTrends = new Map<string, { label: string; value: number }[]>()
      for (let i = 0; i < top5Ids.length; i++) {
        categoryTrends.set(
          top5Ids[i],
          trendResults[i].map((t) => ({
            label: t.month.slice(5),
            value: t.total,
          })),
        )
      }

      const insights = deriveInsights(
        current.categoryBreakdown,
        prevExpenses,
        dayBreakdown,
        personalRouteId,
        convert,
      )

      const year = month.slice(0, 4)
      const yearTotals = await getDashboardYearTotals(db, personalRouteId, businessRouteId, year)
      const monthLabels = [
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
      const ytdMonths = yearTotals.map((t, i) => ({
        label: monthLabels[i],
        value: t.total,
      }))

      const monthsWithSpending = yearTotals.filter((t) => t.total > 0)
      const yearTotal = monthsWithSpending.reduce((sum, t) => sum + t.total, 0)
      const monthlyAvg =
        monthsWithSpending.length > 0 ? Math.round(yearTotal / monthsWithSpending.length) : 0

      let bestMonth: { label: string; total: number } | null = null
      let lightestMonth: { label: string; total: number } | null = null
      for (const t of monthsWithSpending) {
        const idx = yearTotals.indexOf(t)
        const label = monthLabels[idx]
        if (!bestMonth || t.total > bestMonth.total) bestMonth = { label, total: t.total }
        if (!lightestMonth || t.total < lightestMonth.total)
          lightestMonth = { label, total: t.total }
      }

      const ytdStats: YtdStats = {
        yearTotal,
        monthlyAvg,
        monthlyTotals: ytdMonths,
        bestMonth: bestMonth !== lightestMonth ? bestMonth : bestMonth,
        lightestMonth: bestMonth !== lightestMonth ? lightestMonth : null,
      }

      const elapsed = computeDaysElapsed(month, daysElapsedOverride)
      const days = daysInMonth(month)
      const projectedTotal =
        elapsed >= 2 ? Math.round((current.totalAmount / elapsed) * days) : null

      const biggestExpense =
        recentExpenses.length > 0
          ? recentExpenses.reduce((max, e) =>
              convert(e.amount, e.currency) > convert(max.amount, max.currency) ? e : max,
            )
          : null

      setStats({
        ...current,
        prevMonthTotal: prevTotal > 0 ? prevTotal : null,
        dayBreakdown,
        burnRate,
        categoryTrends,
        insights,
        ytdStats,
        recentExpenses,
        biggestExpense,
        daysElapsed: elapsed,
        projectedTotal,
      })
    } finally {
      setLoading(false)
      lastMonthRef.current = month
    }
  }, [db, personalRouteId, businessRouteId, month, convert, dataVersion, daysElapsedOverride])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const reload = useCallback(() => loadStats(), [loadStats])

  return { stats, loading, reload }
}
