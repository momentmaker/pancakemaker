import type { Database } from './interface.js'
import { createTag, logSyncEntry, type ExpenseRow, type TagRow } from './queries.js'

export interface LensTotal {
  currency: string
  amount: number
}

export interface LensSummary {
  name: string
  count: number
  totals: LensTotal[]
  firstDate: string
  lastDate: string
}

export interface LensExpenseRow extends ExpenseRow {
  category_name: string
  category_color: string
  panel_name: string
  route_type: 'personal' | 'business'
}

async function findTag(db: Database, userId: string, name: string): Promise<TagRow | null> {
  const rows = await db.query<TagRow>(
    'SELECT * FROM tags WHERE user_id = ? AND LOWER(name) = LOWER(?) ORDER BY created_at LIMIT 1',
    [userId, name],
  )
  return rows[0] ?? null
}

export async function tagExpense(
  db: Database,
  userId: string,
  expenseId: string,
  names: readonly string[],
): Promise<void> {
  for (const raw of names) {
    const name = raw.trim().toLowerCase()
    if (!name) continue
    let tag = await findTag(db, userId, name)
    if (!tag) {
      tag = await createTag(db, userId, name)
      await logSyncEntry(db, userId, 'tags', tag.id, 'create', { ...tag })
    }
    const linked = await db.query(
      'SELECT 1 FROM expense_tags WHERE expense_id = ? AND tag_id = ?',
      [expenseId, tag.id],
    )
    if (linked.length > 0) continue
    await db.execute('INSERT INTO expense_tags (expense_id, tag_id) VALUES (?, ?)', [
      expenseId,
      tag.id,
    ])
    await logSyncEntry(db, userId, 'expense_tags', `${expenseId}:${tag.id}`, 'create', {
      expense_id: expenseId,
      tag_id: tag.id,
    })
  }
}

export async function getTagsForExpenses(
  db: Database,
  expenseIds: readonly string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (expenseIds.length === 0) return map
  const rows = await db.query<{ expense_id: string; name: string }>(
    `SELECT DISTINCT et.expense_id, LOWER(t.name) AS name
     FROM expense_tags et JOIN tags t ON t.id = et.tag_id
     WHERE et.expense_id IN (${expenseIds.map(() => '?').join(', ')})
     ORDER BY name`,
    [...expenseIds],
  )
  for (const row of rows) {
    const names = map.get(row.expense_id) ?? []
    names.push(row.name)
    map.set(row.expense_id, names)
  }
  return map
}

// A lens is a tag name, not a tag id: the same name created on two devices
// is one lens.
export async function getLenses(db: Database, userId: string): Promise<LensSummary[]> {
  const rows = await db.query<{
    name: string
    id: string
    amount: number
    currency: string
    date: string
  }>(
    `SELECT DISTINCT LOWER(t.name) AS name, e.id, e.amount, e.currency, e.date
     FROM tags t
     JOIN expense_tags et ON et.tag_id = t.id
     JOIN expenses e ON e.id = et.expense_id
     WHERE t.user_id = ? AND e.deleted_at IS NULL`,
    [userId],
  )
  const lenses = new Map<string, LensSummary>()
  for (const row of rows) {
    const lens = lenses.get(row.name) ?? {
      name: row.name,
      count: 0,
      totals: [],
      firstDate: row.date,
      lastDate: row.date,
    }
    lens.count++
    const total = lens.totals.find((t) => t.currency === row.currency)
    if (total) total.amount += row.amount
    else lens.totals.push({ currency: row.currency, amount: row.amount })
    if (row.date < lens.firstDate) lens.firstDate = row.date
    if (row.date > lens.lastDate) lens.lastDate = row.date
    lenses.set(row.name, lens)
  }
  return [...lenses.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate))
}

export async function getLensExpenses(
  db: Database,
  userId: string,
  name: string,
): Promise<LensExpenseRow[]> {
  return db.query<LensExpenseRow>(
    `SELECT DISTINCT e.*, c.name AS category_name, c.color AS category_color,
            p.name AS panel_name, r.type AS route_type
     FROM tags t
     JOIN expense_tags et ON et.tag_id = t.id
     JOIN expenses e ON e.id = et.expense_id
     JOIN categories c ON c.id = e.category_id
     JOIN panels p ON p.id = e.panel_id
     JOIN routes r ON r.id = p.route_id
     WHERE t.user_id = ? AND LOWER(t.name) = LOWER(?) AND e.deleted_at IS NULL
     ORDER BY e.date DESC, e.created_at DESC`,
    [userId, name],
  )
}
