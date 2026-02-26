import type { Database } from './interface.js'

export interface Migration {
  version: number
  name: string
  sql: string
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        base_currency TEXT NOT NULL DEFAULT 'USD',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS routes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        type TEXT NOT NULL CHECK(type IN ('personal', 'business')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        route_id TEXT NOT NULL REFERENCES routes(id),
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS panels (
        id TEXT PRIMARY KEY,
        route_id TEXT NOT NULL REFERENCES routes(id),
        name TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        panel_id TEXT NOT NULL REFERENCES panels(id),
        category_id TEXT NOT NULL REFERENCES categories(id),
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        description TEXT,
        date TEXT NOT NULL,
        is_recurring INTEGER NOT NULL DEFAULT 0,
        recurrence_type TEXT CHECK(recurrence_type IN ('monthly', 'annual')),
        recurrence_end_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS expense_tags (
        expense_id TEXT NOT NULL REFERENCES expenses(id),
        tag_id TEXT NOT NULL REFERENCES tags(id),
        PRIMARY KEY (expense_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS exchange_rates (
        id TEXT PRIMARY KEY,
        base_currency TEXT NOT NULL,
        target_currency TEXT NOT NULL,
        rate REAL NOT NULL,
        date TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
        payload TEXT NOT NULL,
        local_timestamp TEXT NOT NULL,
        synced_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_expenses_panel_id ON expenses(panel_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
      CREATE INDEX IF NOT EXISTS idx_categories_route_id ON categories(route_id);
      CREATE INDEX IF NOT EXISTS idx_panels_route_id ON panels(route_id);
      CREATE INDEX IF NOT EXISTS idx_sync_log_synced_at ON sync_log(synced_at);
      CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup
        ON exchange_rates(base_currency, target_currency, date);
    `,
  },
  {
    version: 2,
    name: 'recurring-templates-and-panel-flags',
    sql: `
      CREATE TABLE IF NOT EXISTS recurring_templates (
        id TEXT PRIMARY KEY,
        panel_id TEXT NOT NULL REFERENCES panels(id),
        category_id TEXT NOT NULL REFERENCES categories(id),
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        description TEXT,
        recurrence_type TEXT NOT NULL CHECK(recurrence_type IN ('monthly', 'annual')),
        recurrence_day INTEGER NOT NULL CHECK(recurrence_day >= 1 AND recurrence_day <= 28),
        start_date TEXT NOT NULL,
        end_date TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_generated_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      ALTER TABLE expenses ADD COLUMN template_id TEXT REFERENCES recurring_templates(id);
      ALTER TABLE panels ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE panels ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;

      CREATE INDEX IF NOT EXISTS idx_recurring_templates_panel_id ON recurring_templates(panel_id);
      CREATE INDEX IF NOT EXISTS idx_recurring_templates_category_id ON recurring_templates(category_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_template_id ON expenses(template_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_category_date ON expenses(category_id, date);

      UPDATE panels SET is_default = 1
      WHERE id IN (
        SELECT p1.id FROM panels p1
        WHERE p1.sort_order = (SELECT MIN(p2.sort_order) FROM panels p2 WHERE p2.route_id = p1.route_id)
        GROUP BY p1.route_id
      );
    `,
  },
  {
    version: 3,
    name: 'panel-based-recurrence',
    sql: `
      ALTER TABLE panels ADD COLUMN recurrence_type TEXT CHECK(recurrence_type IN ('monthly', 'annual'));

      ALTER TABLE expenses ADD COLUMN recurrence_day INTEGER CHECK(recurrence_day >= 1 AND recurrence_day <= 28);
      ALTER TABLE expenses ADD COLUMN source_expense_id TEXT REFERENCES expenses(id);

      CREATE INDEX IF NOT EXISTS idx_expenses_source ON expenses(source_expense_id);
    `,
  },
  {
    version: 4,
    name: 'ensure-recurring-templates-table',
    sql: `
      CREATE TABLE IF NOT EXISTS recurring_templates (
        id TEXT PRIMARY KEY,
        panel_id TEXT NOT NULL REFERENCES panels(id),
        category_id TEXT NOT NULL REFERENCES categories(id),
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        description TEXT,
        recurrence_type TEXT NOT NULL CHECK(recurrence_type IN ('monthly', 'annual')),
        recurrence_day INTEGER NOT NULL CHECK(recurrence_day >= 1 AND recurrence_day <= 28),
        start_date TEXT NOT NULL,
        end_date TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_generated_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
]

const MIGRATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
`

export async function runMigrations(db: Database): Promise<number> {
  await db.execute(MIGRATION_TABLE_SQL)

  const applied = await db.query<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  )
  const appliedVersions = new Set(applied.map((r) => r.version))

  let count = 0
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue

    await db.transaction(async () => {
      await db.execute(migration.sql)
      await db.execute(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        [migration.version, migration.name, new Date().toISOString()],
      )
    })
    count++
  }

  return count
}
