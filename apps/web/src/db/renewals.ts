import type { Database } from './interface.js'
import type { ExpenseRow } from './queries.js'
import { calculateMissingDates } from './recurring-generator.js'

const PRICE_CHANGE_LOOKBACK_DAYS = 120
const RECENTLY_ENDED_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

export interface PriceChange {
  from: number
  to: number
  since: string
}

export interface UpcomingCharge {
  seriesId: string
  name: string
  categoryName: string
  categoryColor: string
  panelId: string
  routeType: 'personal' | 'business'
  recurrenceType: 'monthly' | 'annual'
  nextDate: string
  daysUntil: number
  amount: number
  currency: string
  priceChange: PriceChange | null
  chargesInWindow: number
  totalInWindow: number
}

export interface EndedSeries {
  seriesId: string
  name: string
  panelId: string
  routeType: 'personal' | 'business'
  endDate: string
  amount: number
  currency: string
}

export interface RenewalRadar {
  upcoming: UpcomingCharge[]
  ended: EndedSeries[]
}

interface SeriesRow extends ExpenseRow {
  panel_recurrence_type: 'monthly' | 'annual'
  route_type: 'personal' | 'business'
  category_name: string
  category_color: string
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * DAY_MS).toISOString().split('T')[0]
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY_MS)
}

function latestPriceChange(occurrences: ExpenseRow[], today: string): PriceChange | null {
  const latest = occurrences[occurrences.length - 1]
  for (let i = occurrences.length - 2; i >= 0; i--) {
    if (occurrences[i].amount === latest.amount) continue
    const since = occurrences[i + 1].date
    if (daysBetween(since, today) > PRICE_CHANGE_LOOKBACK_DAYS) return null
    return { from: occurrences[i].amount, to: latest.amount, since }
  }
  return null
}

function projectSeries(
  series: SeriesRow,
  copies: ExpenseRow[],
  today: string,
  horizonDays: number,
): UpcomingCharge | null {
  const endDate = series.recurrence_end_date
  const horizonEnd = addDays(today, horizonDays)
  const recurrenceDay = series.recurrence_day ?? new Date(series.date + 'T00:00:00Z').getUTCDate()
  const lastGenerated = copies.length > 0 ? copies[copies.length - 1].date : null

  const charges = calculateMissingDates(
    series.panel_recurrence_type,
    recurrenceDay,
    series.date,
    lastGenerated,
    horizonEnd,
  ).filter((d) => d > today && (endDate === null || d <= endDate))
  if (charges.length === 0) return null

  const occurrences = [series, ...copies.filter((c) => c.deleted_at === null)].sort((a, b) =>
    a.date.localeCompare(b.date),
  )
  const latest = occurrences[occurrences.length - 1]

  return {
    seriesId: series.id,
    name: series.description || series.category_name,
    categoryName: series.category_name,
    categoryColor: series.category_color,
    panelId: series.panel_id,
    routeType: series.route_type,
    recurrenceType: series.panel_recurrence_type,
    nextDate: charges[0],
    daysUntil: daysBetween(today, charges[0]),
    amount: latest.amount,
    currency: latest.currency,
    priceChange: latestPriceChange(occurrences, today),
    chargesInWindow: charges.length,
    totalInWindow: latest.amount * charges.length,
  }
}

export async function getRenewalRadar(
  db: Database,
  today: string,
  horizonDays: number,
): Promise<RenewalRadar> {
  const seriesRows = await db.query<SeriesRow>(
    `SELECT e.*, p.recurrence_type AS panel_recurrence_type, r.type AS route_type,
            c.name AS category_name, c.color AS category_color
     FROM expenses e
     JOIN panels p ON e.panel_id = p.id
     JOIN routes r ON p.route_id = r.id
     JOIN categories c ON e.category_id = c.id
     WHERE p.recurrence_type IS NOT NULL
       AND e.source_expense_id IS NULL
       AND e.deleted_at IS NULL`,
  )

  const upcoming: UpcomingCharge[] = []
  const ended: EndedSeries[] = []

  for (const series of seriesRows) {
    const copies = await db.query<ExpenseRow>(
      'SELECT * FROM expenses WHERE source_expense_id = ? ORDER BY date',
      [series.id],
    )
    const endDate = series.recurrence_end_date
    if (endDate !== null && endDate < today) {
      if (daysBetween(endDate, today) <= RECENTLY_ENDED_DAYS) {
        const live = [series, ...copies.filter((c) => c.deleted_at === null)]
        const last = live.reduce((a, b) => (b.date > a.date ? b : a))
        ended.push({
          seriesId: series.id,
          name: series.description || series.category_name,
          panelId: series.panel_id,
          routeType: series.route_type,
          endDate,
          amount: last.amount,
          currency: last.currency,
        })
      }
      continue
    }
    const charge = projectSeries(series, copies, today, horizonDays)
    if (charge) upcoming.push(charge)
  }

  upcoming.sort((a, b) => a.nextDate.localeCompare(b.nextDate) || a.name.localeCompare(b.name))
  ended.sort((a, b) => b.endDate.localeCompare(a.endDate))
  return { upcoming, ended }
}

export const COMING_UP_DAYS = 30
export const ANNUAL_WARNING_DAYS = 60
const COMING_UP_LIMIT = 5

export function selectComingUp(upcoming: readonly UpcomingCharge[]): UpcomingCharge[] {
  return upcoming
    .filter(
      (c) =>
        c.daysUntil <= COMING_UP_DAYS ||
        (c.recurrenceType === 'annual' && c.daysUntil <= ANNUAL_WARNING_DAYS),
    )
    .slice(0, COMING_UP_LIMIT)
}
