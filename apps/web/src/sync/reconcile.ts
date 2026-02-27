import type { Database } from '../db/interface.js'
import type { UserRow, CategoryRow, PanelRow, RouteRow } from '../db/queries.js'
import { logSyncEntry } from '../db/queries.js'
import { clearSyncCursor } from './api-client.js'

interface ServerUser {
  id: string
  email: string
  baseCurrency: string
}

export async function reconcileAfterAuth(db: Database, serverUser: ServerUser): Promise<void> {
  const users = await db.query<UserRow>('SELECT * FROM users LIMIT 1')
  const localUser = users[0]
  if (!localUser) return
  if (localUser.id === serverUser.id) return

  const expenseCount = await db.query<{ count: number }>(
    'SELECT COUNT(*) as count FROM expenses WHERE deleted_at IS NULL',
  )
  const hasExpenses = expenseCount[0].count > 0

  if (hasExpenses) {
    await reconcileFirstDevice(db, localUser, serverUser)
  } else {
    await reconcileSecondDevice(db, localUser, serverUser)
  }
}

async function reconcileFirstDevice(
  db: Database,
  localUser: UserRow,
  serverUser: ServerUser,
): Promise<void> {
  await db.execute('PRAGMA foreign_keys=OFF')
  try {
    await db.execute('UPDATE users SET id = ?, email = ? WHERE id = ?', [
      serverUser.id,
      serverUser.email,
      localUser.id,
    ])
    await db.execute('UPDATE routes SET user_id = ? WHERE user_id = ?', [
      serverUser.id,
      localUser.id,
    ])
    await db.execute('UPDATE tags SET user_id = ? WHERE user_id = ?', [serverUser.id, localUser.id])
    await db.execute('UPDATE sync_log SET user_id = ? WHERE user_id = ?', [
      serverUser.id,
      localUser.id,
    ])
  } finally {
    await db.execute('PRAGMA foreign_keys=ON')
  }

  await logSeedData(db, serverUser.id)
}

async function reconcileSecondDevice(
  db: Database,
  localUser: UserRow,
  serverUser: ServerUser,
): Promise<void> {
  await db.execute('PRAGMA foreign_keys=OFF')
  try {
    await db.execute('UPDATE users SET id = ?, email = ?, base_currency = ? WHERE id = ?', [
      serverUser.id,
      serverUser.email,
      serverUser.baseCurrency,
      localUser.id,
    ])
    await db.execute('UPDATE routes SET user_id = ? WHERE user_id = ?', [
      serverUser.id,
      localUser.id,
    ])
    await db.execute('UPDATE tags SET user_id = ? WHERE user_id = ?', [serverUser.id, localUser.id])
    await db.execute('DELETE FROM sync_log')
  } finally {
    await db.execute('PRAGMA foreign_keys=ON')
  }

  clearSyncCursor()
}

async function logSeedData(db: Database, userId: string): Promise<void> {
  const user = await db.query<UserRow>('SELECT * FROM users WHERE id = ?', [userId])
  if (user[0]) {
    const hasEntry = await hasSyncLogEntry(db, 'users', user[0].id)
    if (!hasEntry) {
      await logSyncEntry(db, userId, 'users', user[0].id, 'create', {
        id: user[0].id,
        email: user[0].email,
        base_currency: user[0].base_currency,
        created_at: user[0].created_at,
        updated_at: user[0].updated_at,
      })
    }
  }

  const routes = await db.query<RouteRow>('SELECT * FROM routes WHERE user_id = ?', [userId])
  for (const route of routes) {
    const hasEntry = await hasSyncLogEntry(db, 'routes', route.id)
    if (hasEntry) continue
    await logSyncEntry(db, userId, 'routes', route.id, 'create', {
      id: route.id,
      user_id: route.user_id,
      type: route.type,
      created_at: route.created_at,
      updated_at: route.updated_at,
    })
  }

  const categories = await db.query<CategoryRow>('SELECT * FROM categories')
  for (const cat of categories) {
    const hasEntry = await hasSyncLogEntry(db, 'categories', cat.id)
    if (hasEntry) continue
    await logSyncEntry(db, userId, 'categories', cat.id, 'create', {
      id: cat.id,
      route_id: cat.route_id,
      name: cat.name,
      color: cat.color,
      sort_order: cat.sort_order,
      created_at: cat.created_at,
      updated_at: cat.updated_at,
    })
  }

  const panels = await db.query<PanelRow>('SELECT * FROM panels')
  for (const panel of panels) {
    const hasEntry = await hasSyncLogEntry(db, 'panels', panel.id)
    if (hasEntry) continue
    await logSyncEntry(db, userId, 'panels', panel.id, 'create', {
      id: panel.id,
      route_id: panel.route_id,
      name: panel.name,
      currency: panel.currency,
      sort_order: panel.sort_order,
      recurrence_type: panel.recurrence_type,
      is_default: panel.is_default,
      is_archived: panel.is_archived,
      created_at: panel.created_at,
      updated_at: panel.updated_at,
    })
  }
}

async function hasSyncLogEntry(
  db: Database,
  tableName: string,
  recordId: string,
): Promise<boolean> {
  const rows = await db.query<{ count: number }>(
    'SELECT COUNT(*) as count FROM sync_log WHERE table_name = ? AND record_id = ?',
    [tableName, recordId],
  )
  return rows[0].count > 0
}
