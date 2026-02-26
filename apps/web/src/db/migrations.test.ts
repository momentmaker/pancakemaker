import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from './test-db.js'
import { runMigrations } from './migrations.js'
import type { Database } from './interface.js'

describe('migrations', () => {
  let db: Database

  beforeEach(() => {
    db = createTestDatabase()
  })

  it('creates all tables on first run', async () => {
    const count = await runMigrations(db)
    expect(count).toBe(4)

    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    const tableNames = tables.map((t) => t.name)

    expect(tableNames).toContain('users')
    expect(tableNames).toContain('routes')
    expect(tableNames).toContain('categories')
    expect(tableNames).toContain('panels')
    expect(tableNames).toContain('expenses')
    expect(tableNames).toContain('tags')
    expect(tableNames).toContain('expense_tags')
    expect(tableNames).toContain('exchange_rates')
    expect(tableNames).toContain('sync_log')
    expect(tableNames).toContain('schema_migrations')
  })

  it('is idempotent - skips already applied migrations', async () => {
    await runMigrations(db)
    const count = await runMigrations(db)
    expect(count).toBe(0)
  })

  it('records applied migrations in schema_migrations', async () => {
    await runMigrations(db)

    const records = await db.query<{ version: number; name: string }>(
      'SELECT version, name FROM schema_migrations',
    )
    expect(records).toHaveLength(4)
    expect(records[0].version).toBe(1)
    expect(records[0].name).toBe('initial-schema')
    expect(records[1].version).toBe(2)
    expect(records[1].name).toBe('recurring-templates-and-panel-flags')
    expect(records[2].version).toBe(3)
    expect(records[2].name).toBe('panel-based-recurrence')
    expect(records[3].version).toBe(4)
    expect(records[3].name).toBe('ensure-recurring-templates-table')
  })

  it('creates indexes', async () => {
    await runMigrations(db)

    const indexes = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name",
    )
    const indexNames = indexes.map((i) => i.name)

    expect(indexNames).toContain('idx_expenses_panel_id')
    expect(indexNames).toContain('idx_expenses_category_id')
    expect(indexNames).toContain('idx_expenses_date')
    expect(indexNames).toContain('idx_categories_route_id')
    expect(indexNames).toContain('idx_panels_route_id')
    expect(indexNames).toContain('idx_sync_log_synced_at')
    expect(indexNames).toContain('idx_exchange_rates_lookup')
    expect(indexNames).toContain('idx_expenses_category_date')
    expect(indexNames).toContain('idx_expenses_source')
  })

  it('enforces foreign key constraints', async () => {
    await runMigrations(db)

    await expect(
      db.execute(
        "INSERT INTO routes (id, user_id, type, created_at, updated_at) VALUES ('r1', 'nonexistent', 'personal', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
      ),
    ).rejects.toThrow()
  })
})
