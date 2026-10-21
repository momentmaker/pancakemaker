import type { Database } from '../db/interface.js'
import type { UserRow, RouteRow, CategoryRow, PanelRow, TagRow } from '../db/queries.js'
import { logSyncEntry } from '../db/queries.js'
import { applyEntries } from './apply-entries.js'
import { cursorAfter, storeSyncCursor, type SyncPullEntry } from './api-client.js'

export interface ServerUser {
  id: string
  email: string
  baseCurrency: string
}

interface DeviceRows {
  routes: Set<string>
  categories: Set<string>
  panels: Set<string>
  tags: Set<string>
  expenses: Set<string>
  touched: Set<string>
}

const QUEUED_TABLES = ['routes', 'categories', 'panels', 'tags'] as const

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

async function idsOf(db: Database, table: string): Promise<Set<string>> {
  const rows = await db.query<{ id: string }>(`SELECT id FROM ${table}`)
  return new Set(rows.map((r) => r.id))
}

async function snapshotDeviceRows(db: Database): Promise<DeviceRows> {
  const pending = await db.query<{ record_id: string }>(
    'SELECT record_id FROM sync_log WHERE synced_at IS NULL',
  )
  return {
    routes: await idsOf(db, 'routes'),
    categories: await idsOf(db, 'categories'),
    panels: await idsOf(db, 'panels'),
    tags: await idsOf(db, 'tags'),
    expenses: await idsOf(db, 'expenses'),
    touched: new Set(pending.map((r) => r.record_id)),
  }
}

async function moveToServerUser(
  db: Database,
  localUser: UserRow,
  serverUser: ServerUser,
): Promise<void> {
  await db.execute('UPDATE users SET email = id WHERE id = ?', [localUser.id])
  await db.execute(
    'INSERT INTO users (id, email, base_currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [
      serverUser.id,
      serverUser.email,
      localUser.base_currency,
      localUser.created_at,
      new Date().toISOString(),
    ],
  )
  await db.execute('UPDATE routes SET user_id = ? WHERE user_id = ?', [serverUser.id, localUser.id])
  await db.execute('UPDATE tags SET user_id = ? WHERE user_id = ?', [serverUser.id, localUser.id])
  await db.execute('UPDATE sync_log SET user_id = ? WHERE user_id = ?', [
    serverUser.id,
    localUser.id,
  ])
  await db.execute('DELETE FROM users WHERE id = ?', [localUser.id])
}

async function mapRoutes(db: Database, device: DeviceRows): Promise<Map<string, string>> {
  const routes = await db.query<RouteRow>('SELECT * FROM routes ORDER BY created_at, id')
  const accountRouteByType = new Map<string, string>()
  for (const route of routes) {
    if (!device.routes.has(route.id) && !accountRouteByType.has(route.type)) {
      accountRouteByType.set(route.type, route.id)
    }
  }
  const routeMap = new Map<string, string>()
  for (const route of routes) {
    if (device.routes.has(route.id)) {
      routeMap.set(route.id, accountRouteByType.get(route.type) ?? route.id)
    }
  }
  return routeMap
}

async function isReferenced(
  db: Database,
  column: 'category_id' | 'panel_id',
  id: string,
): Promise<boolean> {
  const rows = await db.query<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM expenses WHERE ${column} = ?) +
            (SELECT COUNT(*) FROM recurring_templates WHERE ${column} = ?) AS n`,
    [id, id],
  )
  return rows[0].n > 0
}

async function mergeCategories(
  db: Database,
  device: DeviceRows,
  routeMap: Map<string, string>,
): Promise<void> {
  const categories = await db.query<CategoryRow>('SELECT * FROM categories ORDER BY sort_order, id')
  const accountCategories = categories.filter((c) => !device.categories.has(c.id))
  for (const category of categories.filter((c) => device.categories.has(c.id))) {
    const routeId = routeMap.get(category.route_id) ?? category.route_id
    if (routeId === category.route_id) continue

    const match = accountCategories.find(
      (c) => c.route_id === routeId && sameName(c.name, category.name),
    )
    if (match) {
      await db.execute('UPDATE expenses SET category_id = ? WHERE category_id = ?', [
        match.id,
        category.id,
      ])
      await db.execute('UPDATE recurring_templates SET category_id = ? WHERE category_id = ?', [
        match.id,
        category.id,
      ])
      await db.execute('DELETE FROM categories WHERE id = ?', [category.id])
    } else if (
      device.touched.has(category.id) ||
      (await isReferenced(db, 'category_id', category.id))
    ) {
      await db.execute('UPDATE categories SET route_id = ? WHERE id = ?', [routeId, category.id])
    } else {
      await db.execute('DELETE FROM categories WHERE id = ?', [category.id])
    }
  }
}

async function mergePanels(
  db: Database,
  device: DeviceRows,
  routeMap: Map<string, string>,
): Promise<void> {
  const panels = await db.query<PanelRow>('SELECT * FROM panels ORDER BY sort_order, id')
  const accountPanels = panels.filter((p) => !device.panels.has(p.id))
  for (const panel of panels.filter((p) => device.panels.has(p.id))) {
    const routeId = routeMap.get(panel.route_id) ?? panel.route_id
    if (routeId === panel.route_id) continue

    const match = accountPanels.find(
      (p) =>
        p.route_id === routeId &&
        p.recurrence_type === panel.recurrence_type &&
        sameName(p.name, panel.name),
    )
    if (match) {
      await db.execute('UPDATE expenses SET panel_id = ? WHERE panel_id = ?', [match.id, panel.id])
      await db.execute('UPDATE recurring_templates SET panel_id = ? WHERE panel_id = ?', [
        match.id,
        panel.id,
      ])
      await db.execute('DELETE FROM panels WHERE id = ?', [panel.id])
    } else if (device.touched.has(panel.id) || (await isReferenced(db, 'panel_id', panel.id))) {
      await db.execute('UPDATE panels SET route_id = ?, is_default = 0 WHERE id = ?', [
        routeId,
        panel.id,
      ])
    } else {
      await db.execute('DELETE FROM panels WHERE id = ?', [panel.id])
    }
  }
}

async function mergeTags(db: Database, device: DeviceRows): Promise<void> {
  const tags = await db.query<TagRow>('SELECT * FROM tags ORDER BY created_at, id')
  const accountTags = tags.filter((t) => !device.tags.has(t.id))
  for (const tag of tags.filter((t) => device.tags.has(t.id))) {
    const match = accountTags.find((t) => sameName(t.name, tag.name))
    if (!match) continue
    await db.execute('UPDATE OR IGNORE expense_tags SET tag_id = ? WHERE tag_id = ?', [
      match.id,
      tag.id,
    ])
    await db.execute('DELETE FROM expense_tags WHERE tag_id = ?', [tag.id])
    await db.execute('DELETE FROM tags WHERE id = ?', [tag.id])
  }
}

async function removeMergedRoutes(db: Database, routeMap: Map<string, string>): Promise<void> {
  for (const [deviceRouteId, accountRouteId] of routeMap) {
    if (deviceRouteId !== accountRouteId) {
      await db.execute('DELETE FROM routes WHERE id = ?', [deviceRouteId])
    }
  }
}

async function queueDeviceRows(db: Database, userId: string, device: DeviceRows): Promise<void> {
  await db.execute('DELETE FROM sync_log WHERE synced_at IS NULL')
  for (const table of QUEUED_TABLES) {
    const rows = await db.query<Record<string, unknown>>(`SELECT * FROM ${table}`)
    for (const row of rows) {
      const id = row.id as string
      if (device[table].has(id)) await logSyncEntry(db, userId, table, id, 'create', row)
    }
  }
  const expenses = await db.query<Record<string, unknown>>(
    'SELECT * FROM expenses ORDER BY created_at, id',
  )
  for (const expense of expenses) {
    const id = expense.id as string
    if (device.expenses.has(id)) await logSyncEntry(db, userId, 'expenses', id, 'create', expense)
  }
}

export async function mergeIntoAccount(
  db: Database,
  localUser: UserRow,
  serverUser: ServerUser,
  history: SyncPullEntry[],
): Promise<void> {
  const device = await snapshotDeviceRows(db)
  await db.transaction(async () => {
    await moveToServerUser(db, localUser, serverUser)
    await applyEntries(db, history, new Set())
    const routeMap = await mapRoutes(db, device)
    await mergeCategories(db, device, routeMap)
    await mergePanels(db, device, routeMap)
    await mergeTags(db, device)
    await removeMergedRoutes(db, routeMap)
    await queueDeviceRows(db, serverUser.id, device)
  })
  storeSyncCursor(cursorAfter(history[history.length - 1]))
}
