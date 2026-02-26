import { Hono } from 'hono'
import type { AppEnv } from '../types.js'
import { requireAuth } from '../middleware/auth.js'

interface SyncEntry {
  id: string
  table_name: string
  record_id: string
  action: 'create' | 'update' | 'delete'
  payload: string
  local_timestamp: string
}

const VALID_TABLES = new Set([
  'users',
  'routes',
  'categories',
  'panels',
  'expenses',
  'tags',
  'expense_tags',
])

const VALID_ACTIONS = new Set(['create', 'update', 'delete'])

export const syncRoutes = new Hono<AppEnv>()

syncRoutes.use('/*', requireAuth)

syncRoutes.post('/push', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ entries?: SyncEntry[] }>()

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return c.json({ error: 'entries array is required' }, 400)
  }

  if (body.entries.length > 500) {
    return c.json({ error: 'Maximum 500 entries per push' }, 400)
  }

  const db = c.env.DB
  const now = new Date().toISOString()
  const statements = []

  for (const entry of body.entries) {
    if (!VALID_TABLES.has(entry.table_name)) {
      return c.json({ error: `Invalid table: ${entry.table_name}` }, 400)
    }
    if (!VALID_ACTIONS.has(entry.action)) {
      return c.json({ error: `Invalid action: ${entry.action}` }, 400)
    }

    statements.push(
      db
        .prepare(
          `INSERT OR REPLACE INTO sync_log (id, user_id, table_name, record_id, action, payload, local_timestamp, server_timestamp, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          entry.id,
          userId,
          entry.table_name,
          entry.record_id,
          entry.action,
          entry.payload,
          entry.local_timestamp,
          now,
          now,
        ),
    )
  }

  await db.batch(statements)

  return c.json({ ok: true, synced: statements.length, server_timestamp: now })
})

syncRoutes.get('/pull', async (c) => {
  const userId = c.get('userId')
  const since = c.req.query('since') ?? '1970-01-01T00:00:00.000Z'

  const db = c.env.DB
  const { results } = await db
    .prepare(
      `SELECT id, table_name, record_id, action, payload, local_timestamp, server_timestamp
       FROM sync_log
       WHERE user_id = ? AND server_timestamp > ?
       ORDER BY server_timestamp ASC
       LIMIT 1000`,
    )
    .bind(userId, since)
    .all<{
      id: string
      table_name: string
      record_id: string
      action: string
      payload: string
      local_timestamp: string
      server_timestamp: string
    }>()

  return c.json({
    entries: results,
    server_timestamp: new Date().toISOString(),
    has_more: results.length === 1000,
  })
})
