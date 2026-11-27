import type { Database } from './interface.js'

export interface DailyTotalRow {
  date: string
  currency: string
  total: number
  count: number
}

export interface YearCategoryTotalRow {
  category_id: string
  name: string
  color: string
  route_type: 'personal' | 'business'
  currency: string
  total: number
}

export async function getYearDailyTotals(
  db: Database,
  personalRouteId: string,
  businessRouteId: string,
  year: string,
): Promise<DailyTotalRow[]> {
  return db.query<DailyTotalRow>(
    `SELECT e.date, e.currency, SUM(e.amount) AS total, COUNT(*) AS count
     FROM expenses e
     JOIN panels p ON e.panel_id = p.id
     WHERE p.route_id IN (?, ?) AND e.deleted_at IS NULL AND substr(e.date, 1, 4) = ?
     GROUP BY e.date, e.currency
     ORDER BY e.date`,
    [personalRouteId, businessRouteId, year],
  )
}

export async function getYearCategoryTotals(
  db: Database,
  personalRouteId: string,
  businessRouteId: string,
  year: string,
): Promise<YearCategoryTotalRow[]> {
  return db.query<YearCategoryTotalRow>(
    `SELECT c.id AS category_id, c.name, c.color, r.type AS route_type, e.currency,
            SUM(e.amount) AS total
     FROM expenses e
     JOIN panels p ON e.panel_id = p.id
     JOIN categories c ON e.category_id = c.id
     JOIN routes r ON c.route_id = r.id
     WHERE p.route_id IN (?, ?) AND e.deleted_at IS NULL AND substr(e.date, 1, 4) = ?
     GROUP BY c.id, e.currency`,
    [personalRouteId, businessRouteId, year],
  )
}
