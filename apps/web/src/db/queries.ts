import type { Database } from './interface.js'

function uuid(): string {
  return crypto.randomUUID()
}

function now(): string {
  return new Date().toISOString()
}

// --- Users ---

export interface UserRow {
  id: string
  email: string
  base_currency: string
  created_at: string
  updated_at: string
}

export async function createUser(
  db: Database,
  email: string,
  baseCurrency = 'USD',
): Promise<UserRow> {
  const id = uuid()
  const timestamp = now()
  await db.execute(
    'INSERT INTO users (id, email, base_currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, email, baseCurrency, timestamp, timestamp],
  )
  const rows = await db.query<UserRow>('SELECT * FROM users WHERE id = ?', [id])
  return rows[0]
}

export async function getUserById(db: Database, id: string): Promise<UserRow | null> {
  const rows = await db.query<UserRow>('SELECT * FROM users WHERE id = ?', [id])
  return rows[0] ?? null
}

// --- Routes ---

export interface RouteRow {
  id: string
  user_id: string
  type: string
  created_at: string
  updated_at: string
}

export async function createRoute(
  db: Database,
  userId: string,
  type: 'personal' | 'business',
): Promise<RouteRow> {
  const id = uuid()
  const timestamp = now()
  await db.execute(
    'INSERT INTO routes (id, user_id, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, userId, type, timestamp, timestamp],
  )
  const rows = await db.query<RouteRow>('SELECT * FROM routes WHERE id = ?', [id])
  return rows[0]
}

export async function getRoutesByUser(db: Database, userId: string): Promise<RouteRow[]> {
  return db.query<RouteRow>('SELECT * FROM routes WHERE user_id = ? ORDER BY type', [userId])
}

// --- Categories ---

export interface CategoryRow {
  id: string
  route_id: string
  name: string
  color: string
  sort_order: number
  created_at: string
  updated_at: string
}

export async function createCategory(
  db: Database,
  routeId: string,
  name: string,
  color: string,
  sortOrder: number,
): Promise<CategoryRow> {
  const id = uuid()
  const timestamp = now()
  await db.execute(
    'INSERT INTO categories (id, route_id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, routeId, name, color, sortOrder, timestamp, timestamp],
  )
  const rows = await db.query<CategoryRow>('SELECT * FROM categories WHERE id = ?', [id])
  return rows[0]
}

export async function getCategoriesByRoute(db: Database, routeId: string): Promise<CategoryRow[]> {
  return db.query<CategoryRow>('SELECT * FROM categories WHERE route_id = ? ORDER BY sort_order', [
    routeId,
  ])
}

export async function updateCategory(
  db: Database,
  id: string,
  updates: Partial<Pick<CategoryRow, 'name' | 'color' | 'sort_order'>>,
): Promise<CategoryRow | null> {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.color !== undefined) {
    fields.push('color = ?')
    values.push(updates.color)
  }
  if (updates.sort_order !== undefined) {
    fields.push('sort_order = ?')
    values.push(updates.sort_order)
  }

  if (fields.length === 0) return null

  fields.push('updated_at = ?')
  values.push(now())
  values.push(id)

  await db.execute(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values)
  const rows = await db.query<CategoryRow>('SELECT * FROM categories WHERE id = ?', [id])
  return rows[0] ?? null
}

export async function deleteCategory(
  db: Database,
  id: string,
  reassignToCategoryId?: string,
): Promise<void> {
  if (reassignToCategoryId) {
    await db.execute('UPDATE expenses SET category_id = ? WHERE category_id = ?', [
      reassignToCategoryId,
      id,
    ])
    await db.execute('UPDATE recurring_templates SET category_id = ? WHERE category_id = ?', [
      reassignToCategoryId,
      id,
    ])
  } else {
    await db.execute(
      'DELETE FROM expense_tags WHERE expense_id IN (SELECT id FROM expenses WHERE category_id = ?)',
      [id],
    )
    await db.execute('DELETE FROM expenses WHERE category_id = ?', [id])
    await db.execute('DELETE FROM recurring_templates WHERE category_id = ?', [id])
  }
  await db.execute('DELETE FROM categories WHERE id = ?', [id])
}

// --- Panels ---

export interface PanelRow {
  id: string
  route_id: string
  name: string
  currency: string
  sort_order: number
  recurrence_type: string | null
  is_default: number
  is_archived: number
  created_at: string
  updated_at: string
}

export async function createPanel(
  db: Database,
  routeId: string,
  name: string,
  currency: string,
  sortOrder: number,
  recurrenceType: 'monthly' | 'annual' | null = null,
  isDefault = false,
): Promise<PanelRow> {
  const id = uuid()
  const timestamp = now()
  await db.execute(
    'INSERT INTO panels (id, route_id, name, currency, sort_order, recurrence_type, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      routeId,
      name,
      currency,
      sortOrder,
      recurrenceType,
      isDefault ? 1 : 0,
      timestamp,
      timestamp,
    ],
  )
  const rows = await db.query<PanelRow>('SELECT * FROM panels WHERE id = ?', [id])
  return rows[0]
}

export async function getPanelsByRoute(
  db: Database,
  routeId: string,
  includeArchived = false,
): Promise<PanelRow[]> {
  const sql = includeArchived
    ? 'SELECT * FROM panels WHERE route_id = ? ORDER BY sort_order'
    : 'SELECT * FROM panels WHERE route_id = ? AND is_archived = 0 ORDER BY sort_order'
  return db.query<PanelRow>(sql, [routeId])
}

export async function updatePanel(
  db: Database,
  id: string,
  updates: Partial<
    Pick<PanelRow, 'name' | 'currency' | 'sort_order' | 'is_default' | 'is_archived'>
  >,
): Promise<PanelRow | null> {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.currency !== undefined) {
    fields.push('currency = ?')
    values.push(updates.currency)
  }
  if (updates.sort_order !== undefined) {
    fields.push('sort_order = ?')
    values.push(updates.sort_order)
  }
  if (updates.is_default !== undefined) {
    fields.push('is_default = ?')
    values.push(updates.is_default)
  }
  if (updates.is_archived !== undefined) {
    fields.push('is_archived = ?')
    values.push(updates.is_archived)
  }

  if (fields.length === 0) return null

  fields.push('updated_at = ?')
  values.push(now())
  values.push(id)

  await db.execute(`UPDATE panels SET ${fields.join(', ')} WHERE id = ?`, values)
  const rows = await db.query<PanelRow>('SELECT * FROM panels WHERE id = ?', [id])
  return rows[0] ?? null
}

export async function deletePanel(
  db: Database,
  id: string,
  reassignToPanelId?: string,
): Promise<void> {
  if (reassignToPanelId) {
    await db.execute('UPDATE expenses SET panel_id = ? WHERE panel_id = ?', [reassignToPanelId, id])
  } else {
    await db.execute(
      'DELETE FROM expense_tags WHERE expense_id IN (SELECT id FROM expenses WHERE panel_id = ?)',
      [id],
    )
    await db.execute('DELETE FROM expenses WHERE panel_id = ?', [id])
  }
  await db.execute('DELETE FROM panels WHERE id = ?', [id])
}

// --- Expenses ---

export interface ExpenseRow {
  id: string
  panel_id: string
  category_id: string
  amount: number
  currency: string
  description: string | null
  date: string
  is_recurring: number
  recurrence_type: string | null
  recurrence_end_date: string | null
  recurrence_day: number | null
  source_expense_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CreateExpenseInput {
  panelId: string
  categoryId: string
  amount: number
  currency: string
  date: string
  description?: string
  isRecurring?: boolean
  recurrenceType?: 'monthly' | 'annual' | null
  recurrenceEndDate?: string | null
  recurrenceDay?: number | null
  sourceExpenseId?: string | null
}

export async function createExpense(db: Database, input: CreateExpenseInput): Promise<ExpenseRow> {
  const id = uuid()
  const timestamp = now()
  await db.execute(
    `INSERT INTO expenses (id, panel_id, category_id, amount, currency, description, date, is_recurring, recurrence_type, recurrence_end_date, recurrence_day, source_expense_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.panelId,
      input.categoryId,
      input.amount,
      input.currency,
      input.description ?? null,
      input.date,
      input.isRecurring ? 1 : 0,
      input.recurrenceType ?? null,
      input.recurrenceEndDate ?? null,
      input.recurrenceDay ?? null,
      input.sourceExpenseId ?? null,
      timestamp,
      timestamp,
    ],
  )
  const rows = await db.query<ExpenseRow>('SELECT * FROM expenses WHERE id = ?', [id])
  return rows[0]
}

export async function getExpensesByPanel(
  db: Database,
  panelId: string,
  month?: string,
): Promise<ExpenseRow[]> {
  if (month) {
    return db.query<ExpenseRow>(
      `SELECT * FROM expenses
       WHERE panel_id = ? AND deleted_at IS NULL AND date LIKE ?
       ORDER BY date DESC`,
      [panelId, `${month}%`],
    )
  }
  return db.query<ExpenseRow>(
    'SELECT * FROM expenses WHERE panel_id = ? AND deleted_at IS NULL ORDER BY date DESC',
    [panelId],
  )
}

export async function updateExpense(
  db: Database,
  id: string,
  updates: Partial<CreateExpenseInput>,
): Promise<ExpenseRow | null> {
  const fieldMap: Record<string, string> = {
    panelId: 'panel_id',
    categoryId: 'category_id',
    amount: 'amount',
    currency: 'currency',
    date: 'date',
    description: 'description',
    isRecurring: 'is_recurring',
    recurrenceType: 'recurrence_type',
    recurrenceEndDate: 'recurrence_end_date',
    recurrenceDay: 'recurrence_day',
    sourceExpenseId: 'source_expense_id',
  }

  const fields: string[] = []
  const values: unknown[] = []

  for (const [key, column] of Object.entries(fieldMap)) {
    const value = updates[key as keyof CreateExpenseInput]
    if (value !== undefined) {
      fields.push(`${column} = ?`)
      values.push(key === 'isRecurring' ? (value ? 1 : 0) : value)
    }
  }

  if (fields.length === 0) return null

  fields.push('updated_at = ?')
  values.push(now())
  values.push(id)

  await db.execute(`UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`, values)
  const rows = await db.query<ExpenseRow>('SELECT * FROM expenses WHERE id = ?', [id])
  return rows[0] ?? null
}

export async function softDeleteExpense(db: Database, id: string): Promise<void> {
  await db.execute('UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?', [
    now(),
    now(),
    id,
  ])
}

// --- Tags ---

export interface TagRow {
  id: string
  user_id: string
  name: string
  created_at: string
}

export async function createTag(db: Database, userId: string, name: string): Promise<TagRow> {
  const id = uuid()
  const timestamp = now()
  await db.execute('INSERT INTO tags (id, user_id, name, created_at) VALUES (?, ?, ?, ?)', [
    id,
    userId,
    name,
    timestamp,
  ])
  const rows = await db.query<TagRow>('SELECT * FROM tags WHERE id = ?', [id])
  return rows[0]
}

export async function getTagsByUser(db: Database, userId: string): Promise<TagRow[]> {
  return db.query<TagRow>('SELECT * FROM tags WHERE user_id = ? ORDER BY name', [userId])
}

export async function deleteTag(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM expense_tags WHERE tag_id = ?', [id])
  await db.execute('DELETE FROM tags WHERE id = ?', [id])
}

// --- Expense Tags ---

export async function addTagToExpense(
  db: Database,
  expenseId: string,
  tagId: string,
): Promise<void> {
  await db.execute('INSERT OR IGNORE INTO expense_tags (expense_id, tag_id) VALUES (?, ?)', [
    expenseId,
    tagId,
  ])
}

export async function removeTagFromExpense(
  db: Database,
  expenseId: string,
  tagId: string,
): Promise<void> {
  await db.execute('DELETE FROM expense_tags WHERE expense_id = ? AND tag_id = ?', [
    expenseId,
    tagId,
  ])
}

export async function getTagsForExpense(db: Database, expenseId: string): Promise<TagRow[]> {
  return db.query<TagRow>(
    `SELECT t.* FROM tags t
     JOIN expense_tags et ON t.id = et.tag_id
     WHERE et.expense_id = ?
     ORDER BY t.name`,
    [expenseId],
  )
}

// --- Sync Log ---

export interface SyncLogRow {
  id: string
  user_id: string
  table_name: string
  record_id: string
  action: string
  payload: string
  local_timestamp: string
  synced_at: string | null
}

export async function logSyncEntry(
  db: Database,
  userId: string,
  tableName: string,
  recordId: string,
  action: 'create' | 'update' | 'delete',
  payload: Record<string, unknown>,
): Promise<void> {
  await db.execute(
    'INSERT INTO sync_log (id, user_id, table_name, record_id, action, payload, local_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [uuid(), userId, tableName, recordId, action, JSON.stringify(payload), now()],
  )
}

export async function getUnsyncedEntries(db: Database): Promise<SyncLogRow[]> {
  return db.query<SyncLogRow>(
    'SELECT * FROM sync_log WHERE synced_at IS NULL ORDER BY local_timestamp ASC',
  )
}

export async function markEntriesSynced(db: Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(', ')
  await db.execute(`UPDATE sync_log SET synced_at = ? WHERE id IN (${placeholders})`, [
    now(),
    ...ids,
  ])
}

export async function getLastSyncTimestamp(db: Database): Promise<string | null> {
  const rows = await db.query<{ synced_at: string }>(
    'SELECT synced_at FROM sync_log WHERE synced_at IS NOT NULL ORDER BY synced_at DESC LIMIT 1',
  )
  return rows[0]?.synced_at ?? null
}

// --- Category-based Queries ---

export async function getExpensesByCategory(
  db: Database,
  categoryId: string,
  month?: string,
): Promise<ExpenseRow[]> {
  if (month) {
    return db.query<ExpenseRow>(
      `SELECT * FROM expenses
       WHERE category_id = ? AND deleted_at IS NULL AND date LIKE ?
       ORDER BY date DESC`,
      [categoryId, `${month}%`],
    )
  }
  return db.query<ExpenseRow>(
    'SELECT * FROM expenses WHERE category_id = ? AND deleted_at IS NULL ORDER BY date DESC',
    [categoryId],
  )
}

export interface CategoryTotal {
  category_id: string
  total: number
  count: number
}

export async function getCategoryTotals(
  db: Database,
  routeId: string,
  month: string,
): Promise<CategoryTotal[]> {
  return db.query<CategoryTotal>(
    `SELECT e.category_id, SUM(e.amount) as total, COUNT(*) as count
     FROM expenses e
     JOIN panels p ON e.panel_id = p.id
     WHERE p.route_id = ? AND e.deleted_at IS NULL AND e.date LIKE ?
     GROUP BY e.category_id`,
    [routeId, `${month}%`],
  )
}

export interface CategoryCurrencyTotal {
  category_id: string
  currency: string
  total: number
  count: number
}

export async function getCategoryTotalsByCurrency(
  db: Database,
  routeId: string,
  month: string,
): Promise<CategoryCurrencyTotal[]> {
  return db.query<CategoryCurrencyTotal>(
    `SELECT e.category_id, e.currency, SUM(e.amount) as total, COUNT(*) as count
     FROM expenses e
     JOIN panels p ON e.panel_id = p.id
     WHERE p.route_id = ? AND e.deleted_at IS NULL AND e.date LIKE ?
     GROUP BY e.category_id, e.currency`,
    [routeId, `${month}%`],
  )
}

// --- Category Trend ---

export interface MonthlyTotal {
  month: string
  total: number
}

export async function getCategoryMonthlyTrend(
  db: Database,
  categoryId: string,
  currentMonth: string,
  count = 6,
  convert?: (amount: number, currency: string) => number,
): Promise<MonthlyTotal[]> {
  const months: string[] = []
  const [year, m] = currentMonth.split('-').map(Number)
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(year, m - 1 - i)
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    months.push(`${y}-${mo}`)
  }

  const placeholders = months.map(() => '?').join(', ')
  const rows = await db.query<{ month: string; currency: string; total: number }>(
    `SELECT substr(date, 1, 7) as month, currency, SUM(amount) as total
     FROM expenses
     WHERE category_id = ? AND deleted_at IS NULL AND substr(date, 1, 7) IN (${placeholders})
     GROUP BY month, currency`,
    [categoryId, ...months],
  )

  const totalsMap = new Map<string, number>()
  for (const r of rows) {
    const converted = convert ? convert(r.total, r.currency) : r.total
    totalsMap.set(r.month, (totalsMap.get(r.month) ?? 0) + converted)
  }
  return months.map((month) => ({ month, total: totalsMap.get(month) ?? 0 }))
}

export async function getPanelMonthlyTrend(
  db: Database,
  panelId: string,
  currentMonth: string,
  count = 6,
): Promise<MonthlyTotal[]> {
  const months: string[] = []
  const [year, m] = currentMonth.split('-').map(Number)
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(year, m - 1 - i)
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    months.push(`${y}-${mo}`)
  }

  const placeholders = months.map(() => '?').join(', ')
  const rows = await db.query<{ month: string; total: number }>(
    `SELECT substr(date, 1, 7) as month, SUM(amount) as total
     FROM expenses
     WHERE panel_id = ? AND deleted_at IS NULL AND substr(date, 1, 7) IN (${placeholders})
     GROUP BY month`,
    [panelId, ...months],
  )

  const totalsMap = new Map(rows.map((r) => [r.month, r.total]))
  return months.map((month) => ({ month, total: totalsMap.get(month) ?? 0 }))
}

// --- Exchange Rates ---

export interface ExchangeRateRow {
  base_currency: string
  target_currency: string
  rate: number
  date: string
}

export async function getExchangeRates(
  db: Database,
  baseCurrency: string,
): Promise<ExchangeRateRow[]> {
  return db.query<ExchangeRateRow>(
    `SELECT base_currency, target_currency, rate, date
     FROM exchange_rates
     WHERE base_currency = ?
     ORDER BY date DESC`,
    [baseCurrency],
  )
}

export async function upsertExchangeRates(
  db: Database,
  baseCurrency: string,
  date: string,
  rates: Record<string, number>,
): Promise<void> {
  for (const [target, rate] of Object.entries(rates)) {
    const id = `${baseCurrency}-${target}-${date}`
    await db.execute(
      `INSERT OR REPLACE INTO exchange_rates (id, base_currency, target_currency, rate, date, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, baseCurrency, target, rate, date, now()],
    )
  }
}

export async function getDashboardYearTotals(
  db: Database,
  personalRouteId: string,
  businessRouteId: string,
  year: string,
  convert?: (amount: number, currency: string) => number,
): Promise<{ month: string; total: number }[]> {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)

  const rows = await db.query<{ month: string; currency: string; total: number }>(
    `SELECT substr(e.date, 1, 7) as month, e.currency, SUM(e.amount) as total
     FROM expenses e
     JOIN panels p ON e.panel_id = p.id
     WHERE p.route_id IN (?, ?)
       AND e.deleted_at IS NULL
       AND substr(e.date, 1, 4) = ?
     GROUP BY month, e.currency`,
    [personalRouteId, businessRouteId, year],
  )

  const totalsMap = new Map<string, number>()
  for (const r of rows) {
    const converted = convert ? convert(r.total, r.currency) : r.total
    totalsMap.set(r.month, (totalsMap.get(r.month) ?? 0) + converted)
  }
  return months.map((month) => ({ month, total: totalsMap.get(month) ?? 0 }))
}

// --- Export ---

export interface ExportRow {
  date: string
  amount: number
  currency: string
  category: string
  panel: string
  route_type: string
  description: string
}

// --- Dashboard ---

export interface DashboardExpenseRow {
  amount: number
  currency: string
  date: string
  description: string | null
  panel_id: string
  category_id: string
  category_name: string
  category_color: string
  route_id: string
  panel_recurrence_type: string | null
}

export async function getDashboardExpenses(
  db: Database,
  personalRouteId: string,
  businessRouteId: string,
  month: string,
): Promise<DashboardExpenseRow[]> {
  return db.query<DashboardExpenseRow>(
    `SELECT e.amount, e.currency, e.date, e.description,
            e.panel_id, e.category_id,
            c.name AS category_name, c.color AS category_color,
            p.route_id, p.recurrence_type AS panel_recurrence_type
     FROM expenses e
     JOIN panels p ON e.panel_id = p.id
     JOIN categories c ON e.category_id = c.id
     WHERE p.route_id IN (?, ?)
       AND e.deleted_at IS NULL AND e.date LIKE ?
     ORDER BY e.date DESC, e.created_at DESC`,
    [personalRouteId, businessRouteId, `${month}%`],
  )
}

export interface DashboardRecentExpenseRow {
  id: string
  amount: number
  currency: string
  date: string
  description: string | null
  panel_id: string
  panel_name: string
  category_name: string
  category_color: string
  route_id: string
}

export async function getDashboardRecentExpenses(
  db: Database,
  personalRouteId: string,
  businessRouteId: string,
  limit = 10,
): Promise<DashboardRecentExpenseRow[]> {
  return db.query<DashboardRecentExpenseRow>(
    `SELECT e.id, e.amount, e.currency, e.date, e.description,
            e.panel_id, p.name AS panel_name,
            c.name AS category_name, c.color AS category_color,
            p.route_id
     FROM expenses e
     JOIN panels p ON e.panel_id = p.id
     JOIN categories c ON e.category_id = c.id
     WHERE p.route_id IN (?, ?)
       AND e.deleted_at IS NULL
     ORDER BY e.date DESC, e.created_at DESC
     LIMIT ?`,
    [personalRouteId, businessRouteId, limit],
  )
}

// --- Export ---

export async function getExportRows(db: Database, userId: string): Promise<ExportRow[]> {
  return db.query<ExportRow>(
    `SELECT
       e.date,
       e.amount,
       e.currency,
       c.name AS category,
       p.name AS panel,
       r.type AS route_type,
       COALESCE(e.description, '') AS description
     FROM expenses e
     JOIN panels p ON e.panel_id = p.id
     JOIN categories c ON e.category_id = c.id
     JOIN routes r ON p.route_id = r.id
     WHERE r.user_id = ? AND e.deleted_at IS NULL
     ORDER BY e.date DESC, e.created_at DESC`,
    [userId],
  )
}
