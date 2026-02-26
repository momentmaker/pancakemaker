interface Migration {
  version: number
  name: string
  statements: string[]
}

const INITIAL_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    base_currency TEXT NOT NULL DEFAULT 'USD',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK(type IN ('personal', 'business')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL REFERENCES routes(id),
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS panels (
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL REFERENCES routes(id),
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS expenses (
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
  )`,
  `CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS expense_tags (
    expense_id TEXT NOT NULL REFERENCES expenses(id),
    tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (expense_id, tag_id)
  )`,
  `CREATE TABLE IF NOT EXISTS exchange_rates (
    id TEXT PRIMARY KEY,
    base_currency TEXT NOT NULL,
    target_currency TEXT NOT NULL,
    rate REAL NOT NULL,
    date TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
    payload TEXT NOT NULL,
    local_timestamp TEXT NOT NULL,
    server_timestamp TEXT,
    synced_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS auth_tokens (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_panel_id ON expenses(panel_id)`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)`,
  `CREATE INDEX IF NOT EXISTS idx_categories_route_id ON categories(route_id)`,
  `CREATE INDEX IF NOT EXISTS idx_panels_route_id ON panels(route_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_log_synced_at ON sync_log(synced_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_log_user_id ON sync_log(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup ON exchange_rates(base_currency, target_currency, date)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token)`,
]

const migrations: Migration[] = [
  { version: 1, name: 'initial-schema', statements: INITIAL_SCHEMA_STATEMENTS },
]

const MIGRATION_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`

export async function runD1Migrations(db: D1Database): Promise<number> {
  await db.prepare(MIGRATION_TABLE).run()

  const { results } = await db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all<{ version: number }>()
  const applied = new Set(results.map((r) => r.version))

  let count = 0
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue

    const batch = migration.statements.map((sql) => db.prepare(sql))
    batch.push(
      db
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .bind(migration.version, migration.name, new Date().toISOString()),
    )
    await db.batch(batch)
    count++
  }

  return count
}
