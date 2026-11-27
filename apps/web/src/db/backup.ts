import type { Database } from './interface.js'
import { logSyncEntry } from './queries.js'

export const BACKUP_FORMAT = 'pancakemaker-backup'
export const BACKUP_VERSION = 1

type Row = Record<string, unknown>

export interface PancakeBackup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  routes: Row[]
  categories: Row[]
  panels: Row[]
  expenses: Row[]
  tags: Row[]
  expenseTags: Row[]
}

export interface RestoreSummary {
  added: number
  updated: number
  unchanged: number
}

export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidBackupError'
  }
}

export async function createBackup(db: Database): Promise<PancakeBackup> {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    routes: await db.query<Row>('SELECT id, type FROM routes'),
    categories: await db.query<Row>('SELECT * FROM categories'),
    panels: await db.query<Row>('SELECT * FROM panels'),
    // Deleted rows are kept so a restored recurring series does not regrow
    // months the user removed.
    expenses: await db.query<Row>('SELECT * FROM expenses'),
    tags: await db.query<Row>('SELECT * FROM tags'),
    expenseTags: await db.query<Row>('SELECT * FROM expense_tags'),
  }
}

export function parseBackup(text: string): PancakeBackup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new InvalidBackupError('This file is not a pancakemaker backup.')
  }
  const backup = data as Partial<PancakeBackup> | null
  if (!backup || backup.format !== BACKUP_FORMAT) {
    throw new InvalidBackupError('This file is not a pancakemaker backup.')
  }
  if (typeof backup.version !== 'number' || backup.version > BACKUP_VERSION) {
    throw new InvalidBackupError(
      'This backup was made by a newer version of pancakemaker. Update the app and try again.',
    )
  }
  for (const key of [
    'routes',
    'categories',
    'panels',
    'expenses',
    'tags',
    'expenseTags',
  ] as const) {
    if (!Array.isArray(backup[key])) {
      throw new InvalidBackupError(`This backup is incomplete: "${key}" is missing.`)
    }
  }
  return backup as PancakeBackup
}

function sameName(a: unknown, b: unknown): boolean {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
}

async function columnsOf(db: Database, table: string): Promise<Set<string>> {
  const rows = await db.query<{ name: string }>(`PRAGMA table_info(${table})`)
  return new Set(rows.map((r) => r.name))
}

// Only columns this device's schema knows are written, so a backup from a
// newer app version still restores what it can.
async function insertRow(db: Database, table: string, row: Row, columns: Set<string>) {
  const cols = Object.keys(row).filter((c) => columns.has(c))
  await db.execute(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map((c) => row[c]),
  )
}

async function updateRow(db: Database, table: string, row: Row, columns: Set<string>) {
  const cols = Object.keys(row).filter((c) => columns.has(c) && c !== 'id')
  await db.execute(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [
    ...cols.map((c) => row[c]),
    row.id,
  ])
}

async function idExists(db: Database, table: string, id: unknown): Promise<boolean> {
  const rows = await db.query<{ id: string }>(`SELECT id FROM ${table} WHERE id = ?`, [id])
  return rows.length > 0
}

export async function restoreBackup(
  db: Database,
  userId: string,
  backup: PancakeBackup,
): Promise<RestoreSummary> {
  const summary: RestoreSummary = { added: 0, updated: 0, unchanged: 0 }
  const columns = {
    categories: await columnsOf(db, 'categories'),
    panels: await columnsOf(db, 'panels'),
    expenses: await columnsOf(db, 'expenses'),
    tags: await columnsOf(db, 'tags'),
  }

  await db.transaction(async () => {
    const localRoutes = await db.query<{ id: string; type: string }>(
      'SELECT id, type FROM routes WHERE user_id = ?',
      [userId],
    )
    const routeMap = new Map<unknown, string>()
    for (const route of backup.routes) {
      const local = localRoutes.find((r) => r.type === route.type)
      if (!local) throw new InvalidBackupError(`This device has no ${String(route.type)} route.`)
      routeMap.set(route.id, local.id)
    }

    const categoryMap = new Map<unknown, unknown>()
    const localCategories = await db.query<Row>('SELECT * FROM categories')
    for (const cat of backup.categories) {
      const routeId = routeMap.get(cat.route_id)
      const match = localCategories.find(
        (c) => c.route_id === routeId && sameName(c.name, cat.name),
      )
      if (match) {
        categoryMap.set(cat.id, match.id)
        continue
      }
      const row: Row = { ...cat, route_id: routeId }
      if (await idExists(db, 'categories', cat.id)) row.id = crypto.randomUUID()
      await insertRow(db, 'categories', row, columns.categories)
      await logSyncEntry(db, userId, 'categories', String(row.id), 'create', row)
      categoryMap.set(cat.id, row.id)
    }

    const panelMap = new Map<unknown, unknown>()
    const localPanels = await db.query<Row>('SELECT * FROM panels')
    for (const panel of backup.panels) {
      const routeId = routeMap.get(panel.route_id)
      const match = localPanels.find(
        (p) =>
          p.route_id === routeId &&
          sameName(p.name, panel.name) &&
          (p.recurrence_type ?? null) === (panel.recurrence_type ?? null),
      )
      if (match) {
        panelMap.set(panel.id, match.id)
        continue
      }
      const row: Row = { ...panel, route_id: routeId, is_default: 0 }
      if (await idExists(db, 'panels', panel.id)) row.id = crypto.randomUUID()
      await insertRow(db, 'panels', row, columns.panels)
      await logSyncEntry(db, userId, 'panels', String(row.id), 'create', row)
      panelMap.set(panel.id, row.id)
    }

    // Originals before their recurring copies, which reference them.
    const expenses = [...backup.expenses].sort(
      (a, b) => Number(a.source_expense_id != null) - Number(b.source_expense_id != null),
    )
    for (const expense of expenses) {
      const row: Row = {
        ...expense,
        panel_id: panelMap.get(expense.panel_id),
        category_id: categoryMap.get(expense.category_id),
        template_id: null,
      }
      const existing = await db.query<{ updated_at: string }>(
        'SELECT updated_at FROM expenses WHERE id = ?',
        [expense.id],
      )
      if (existing.length === 0) {
        await insertRow(db, 'expenses', row, columns.expenses)
        await logSyncEntry(db, userId, 'expenses', String(row.id), 'create', row)
        summary.added++
      } else if (String(expense.updated_at) > existing[0].updated_at) {
        await updateRow(db, 'expenses', row, columns.expenses)
        await logSyncEntry(db, userId, 'expenses', String(row.id), 'update', row)
        summary.updated++
      } else {
        summary.unchanged++
      }
    }

    const tagMap = new Map<unknown, unknown>()
    const localTags = await db.query<Row>('SELECT * FROM tags WHERE user_id = ?', [userId])
    for (const tag of backup.tags) {
      const match = localTags.find((t) => sameName(t.name, tag.name))
      if (match) {
        tagMap.set(tag.id, match.id)
        continue
      }
      const row: Row = { ...tag, user_id: userId }
      if (await idExists(db, 'tags', tag.id)) row.id = crypto.randomUUID()
      await insertRow(db, 'tags', row, columns.tags)
      tagMap.set(tag.id, row.id)
    }
    for (const link of backup.expenseTags) {
      await db.execute('INSERT OR IGNORE INTO expense_tags (expense_id, tag_id) VALUES (?, ?)', [
        link.expense_id,
        tagMap.get(link.tag_id),
      ])
    }
  })

  return summary
}
