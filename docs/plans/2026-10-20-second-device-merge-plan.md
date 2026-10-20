# Second-Device Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a device that already holds data signs in to an account that has data, merge the device's routes, categories, panels, tags and expenses into the account's instead of duplicating routes.

**Architecture:**

- At sign-in, reconcile downloads the account's full history.
- If the history is empty, the device adopts the account, as it does today.
- Otherwise, in one transaction, the device:
  1. moves to the server user;
  2. applies the history locally, using the sync engine's apply code (moved into a shared module);
  3. maps its rows onto the account's by route type and name;
  4. repoints references and deletes the duplicates;
  5. re-queues only what the account lacks.
- Separately, sync log ids sort in creation order, so a parent entry never lands on a later pull page than its child.

**Tech Stack:** React with wa-sqlite (client); Vitest with better-sqlite3 test DBs; the in-memory fake sync server from stage 1 (`apps/web/src/sync/test-sync-server.ts`).

**Spec:** `docs/plans/2026-10-20-sync-cursor-and-merge-design.md`, section "Design: Stage 2, Second-Device Merge". Stage 1 is already merged.

## Global Constraints

- Run every Node command with Node 22: `export PATH=/opt/homebrew/opt/node@22/bin:$PATH`.
- Run web tests from `apps/web`; vitest from the repo root skips the web test setup.
- Never use `PRAGMA foreign_keys` inside `db.transaction`. SQLite ignores it there. Keep foreign keys valid by statement order instead.
- Name matching: trim, then compare case-insensitively. Panels also match on `recurrence_type`.
- For a matched row, the account's version wins.
- No schema migrations.
- Tests use `// #given`, `// #when` and `// #then` comments, one behavior per test.
- Commits use conventional messages ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before pushing, run `npx prettier --check .` from the repo root. Untracked `.claude/session-context.md` and `.superpowers/` files may be flagged; ignore them.

## Review Focus

- **Duplicate account routes.** The account already has two routes of one type, from the pre-fix duplicate bug. Device rows must map to the oldest one. Test: Task 5, "maps device rows to the oldest account route of a type".
- **Email collision.** The device's local user already has the account's email. The merge must still succeed. Test: Task 5, "merges when the device user already has the account email".
- **Merge fails partway.** The device must be left exactly as it was. Test: Task 4, "leaves the device untouched when the merge fails".
- **Unappliable account entry.** The account history contains an entry that can't apply, such as an expense whose category is missing. The merge must skip it and finish. Test: Task 5, "merges even when an account entry fails to apply".
- **Large history.** The account history spans several pull pages. The download must return all of it, in order. Test: Task 3, "downloads every page of the account history".

---

### Task 1: Sync log ids sort in creation order

**Files:**

- Modify: `apps/web/src/db/queries.ts` (`logSyncEntry`, new `syncEntryId`)
- Test: `apps/web/src/db/queries.test.ts` (the `sync log` describe block)

**Interfaces:**

- Produces: every `sync_log.id` written by `logSyncEntry` has the format `<13-digit ms>-<6-digit sequence>-<uuid>`. Ids sort in the order the entries were logged, even if `Date.now()` moves backwards.

- [ ] **Step 1: Write the failing tests**

Add inside the `describe('sync log', ...)` block in `apps/web/src/db/queries.test.ts`:

```ts
it('gives sync entries ids that sort in the order they were logged', async () => {
  // #given
  const recordIds = Array.from({ length: 20 }, (_, i) => `r-${String(i).padStart(2, '0')}`)

  // #when
  for (const recordId of recordIds) {
    await logSyncEntry(db, userId, 'expenses', recordId, 'create', { id: recordId })
  }

  // #then
  const rows = await db.query<{ record_id: string }>('SELECT record_id FROM sync_log ORDER BY id')
  expect(rows.map((r) => r.record_id)).toEqual(recordIds)
})

it('keeps sync entry ids increasing when the clock moves backwards', async () => {
  // #given
  const recordIds = Array.from({ length: 10 }, (_, i) => `r-${i}`)
  const clock = vi.spyOn(Date, 'now')
  recordIds.forEach((_, i) => clock.mockReturnValueOnce(9_000_000_000_000 - i * 1000))

  // #when
  for (const recordId of recordIds) {
    await logSyncEntry(db, userId, 'expenses', recordId, 'create', { id: recordId })
  }
  clock.mockRestore()

  // #then
  const rows = await db.query<{ record_id: string }>('SELECT record_id FROM sync_log ORDER BY id')
  expect(rows.map((r) => r.record_id)).toEqual(recordIds)
})
```

If `vi` is not already imported in this file, add it to the `vitest` import.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/web && npx vitest run src/db/queries.test.ts -t "sync entr"`

Expected: both FAIL. Random UUID ids sort in a random order, so `toEqual` fails.

- [ ] **Step 3: Implement**

In `apps/web/src/db/queries.ts`, add after `function now()`:

```ts
let lastSyncEntryTime = 0
let syncEntrySequence = 0

function syncEntryId(): string {
  const time = Math.max(Date.now(), lastSyncEntryTime)
  syncEntrySequence = time === lastSyncEntryTime ? syncEntrySequence + 1 : 0
  lastSyncEntryTime = time
  return `${String(time).padStart(13, '0')}-${String(syncEntrySequence).padStart(6, '0')}-${uuid()}`
}
```

In `logSyncEntry`, replace `uuid()` in the parameter list with `syncEntryId()`.

- [ ] **Step 4: Run the db and sync tests and confirm they pass**

Run: `cd apps/web && npx vitest run src/db src/sync`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/db/queries.ts apps/web/src/db/queries.test.ts
git commit -m "fix(sync): give sync log entries ids that sort in creation order

Entries from one push share a server timestamp, and pages break ties by
id. With random ids, a page boundary inside a batch could put an expense
on an earlier page than the category it references, so the expense failed
its foreign key check on the pulling device and was skipped for good.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Move the apply code into a shared module

**Files:**

- Create: `apps/web/src/sync/apply-entries.ts`
- Create: `apps/web/src/sync/apply-entries.test.ts`
- Modify: `apps/web/src/sync/sync-engine.ts` (remove the moved code; import it instead)

**Interfaces:**

- Produces:
  - `TABLE_PRIORITY: Record<string, number>`
  - `yieldToMain(): Promise<void>`
  - `applyRemoteEntry(db: Database, entry: SyncPullEntry): Promise<void>`
  - `applyEntries(db: Database, entries: SyncPullEntry[], appliedTables: Set<string>): Promise<number>`: sorts by `TABLE_PRIORITY`, applies in batches of 20 with a yield between batches, logs and skips entries that fail, and returns the number applied.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/sync/apply-entries.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from '../db/test-db.js'
import { runMigrations } from '../db/migrations.js'
import { createUser, createRoute, createPanel } from '../db/queries.js'
import type { Database } from '../db/interface.js'
import type { SyncPullEntry } from './api-client.js'
import { applyEntries } from './apply-entries.js'

let db: Database
let routeId: string
let panelId: string

beforeEach(async () => {
  db = createTestDatabase()
  await runMigrations(db)
  const user = await createUser(db, 'test@example.com', 'USD')
  routeId = (await createRoute(db, user.id, 'personal')).id
  panelId = (await createPanel(db, routeId, 'Daily', 'USD', 0, null, true)).id
})

function entry(id: string, table: string, payload: Record<string, unknown>): SyncPullEntry {
  return {
    id,
    table_name: table,
    record_id: payload.id as string,
    action: 'create',
    payload: JSON.stringify(payload),
    local_timestamp: '2026-01-02T00:00:00.000Z',
    server_timestamp: '2026-01-02T00:00:00.000Z',
  }
}

function expenseEntry(id: string, categoryId: string): SyncPullEntry {
  return entry(`entry-${id}`, 'expenses', {
    id,
    panel_id: panelId,
    category_id: categoryId,
    amount: 100,
    currency: 'USD',
    date: '2026-01-02',
    is_recurring: 0,
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  })
}

const category = {
  id: 'cat-1',
  name: 'Remote',
  color: '#ffffff',
  sort_order: 0,
  created_at: '2026-01-02T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
}

describe('applyEntries', () => {
  it('applies a child listed before its parent by applying tables in priority order', async () => {
    // #given
    const entries = [
      expenseEntry('exp-1', 'cat-1'),
      entry('entry-cat-1', 'categories', { ...category, route_id: routeId }),
    ]

    // #when
    const applied = await applyEntries(db, entries, new Set())

    // #then
    expect(applied).toBe(2)
  })

  it('skips an entry that fails to apply and counts only the rest', async () => {
    // #given
    const entries = [
      entry('entry-cat-1', 'categories', { ...category, route_id: routeId }),
      expenseEntry('exp-orphan', 'missing-category'),
    ]

    // #when
    const applied = await applyEntries(db, entries, new Set())

    // #then
    expect(applied).toBe(1)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/web && npx vitest run src/sync/apply-entries.test.ts`

Expected: FAIL. The module `./apply-entries.js` does not exist.

- [ ] **Step 3: Create the module**

Create `apps/web/src/sync/apply-entries.ts`. Move the following from `sync-engine.ts` without changing behavior:

- the `TABLE_PRIORITY` constant, now exported;
- `yieldToMain`, now exported;
- the engine's inner `applyRemoteEntry` and `applyEntries`, now exported top-level functions that take `db` as their first parameter.

```ts
import type { Database } from '../db/interface.js'
import type { SyncPullEntry } from './api-client.js'

const APPLY_BATCH_SIZE = 20

export const TABLE_PRIORITY: Record<string, number> = {
  users: 0,
  routes: 1,
  categories: 2,
  panels: 3,
  tags: 4,
  recurring_templates: 5,
  expenses: 6,
  expense_tags: 7,
}

export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export async function applyRemoteEntry(db: Database, entry: SyncPullEntry): Promise<void> {
  const payload = JSON.parse(entry.payload) as Record<string, unknown>
  const table = entry.table_name

  if (entry.action === 'create') {
    const cols = Object.keys(payload)
    const placeholders = cols.map(() => '?').join(', ')
    await db.execute(
      `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
      cols.map((k) => payload[k] as unknown),
    )
  } else if (entry.action === 'update') {
    const { id, ...rest } = payload
    const sets = Object.keys(rest)
      .map((k) => `${k} = ?`)
      .join(', ')
    if (sets && id) {
      await db.execute(`UPDATE ${table} SET ${sets} WHERE id = ?`, [...Object.values(rest), id])
    }
  } else if (entry.action === 'delete') {
    if (table === 'expenses') {
      await db.execute('UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?', [
        new Date().toISOString(),
        new Date().toISOString(),
        entry.record_id,
      ])
    } else {
      await db.execute(`DELETE FROM ${table} WHERE id = ?`, [entry.record_id])
    }
  }
}

export async function applyEntries(
  db: Database,
  entries: SyncPullEntry[],
  appliedTables: Set<string>,
): Promise<number> {
  const sorted = [...entries].sort((a, b) => {
    const pa = TABLE_PRIORITY[a.table_name] ?? 99
    const pb = TABLE_PRIORITY[b.table_name] ?? 99
    return pa - pb
  })

  let applied = 0
  for (let i = 0; i < sorted.length; i += APPLY_BATCH_SIZE) {
    const batch = sorted.slice(i, i + APPLY_BATCH_SIZE)
    for (const entry of batch) {
      try {
        await applyRemoteEntry(db, entry)
        applied++
        appliedTables.add(entry.table_name)
      } catch (err) {
        console.log(
          '[sync] apply failed: table=%s action=%s id=%s',
          entry.table_name,
          entry.action,
          entry.record_id,
          err,
        )
      }
    }
    if (i + APPLY_BATCH_SIZE < sorted.length) await yieldToMain()
  }
  return applied
}
```

Before deleting the engine's copies, compare them line by line with the code above. If the engine's `applyRemoteEntry` differs, move the engine's version and record the difference in the ledger.

- [ ] **Step 4: Use the module from the engine**

In `apps/web/src/sync/sync-engine.ts`:

- Delete `PULL_BATCH_SIZE`, `yieldToMain`, `TABLE_PRIORITY`, the inner `applyRemoteEntry` and the inner `applyEntries`.
- Add: `import { TABLE_PRIORITY, applyEntries, yieldToMain } from './apply-entries.js'`.
- In `pull()`, replace `applyEntries(entries, appliedTables)` with `applyEntries(db, entries, appliedTables)`.

- [ ] **Step 5: Run the sync tests and type-check**

Run: `cd apps/web && npx vitest run src/sync && npx tsc -b`

Expected: PASS and no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/sync/apply-entries.ts apps/web/src/sync/apply-entries.test.ts apps/web/src/sync/sync-engine.ts
git commit -m "refactor(sync): move pulled-entry apply code into a shared module

Reconcile needs to apply an account's history the same way the sync
engine applies pulls.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Download an account's full history

**Files:**

- Modify: `apps/web/src/sync/api-client.ts` (new `pullAllEntries`)
- Test: `apps/web/src/sync/api-client.test.ts`

**Interfaces:**

- Consumes: `pullEntries`, `cursorAfter` and `isAfterCursor` (stage 1).
- Produces: `pullAllEntries(): Promise<ApiResult<SyncPullEntry[]>>`. It pages from no cursor until `has_more` is false and returns every entry in server order. It fails if a page fails, or if a page starts at or before the cursor.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/sync/api-client.test.ts`, add `pullAllEntries` to the `./api-client.js` import list and add `import { installFakeSyncServer } from './test-sync-server.js'`. Then add:

```ts
describe('pullAllEntries', () => {
  function tagDelete(id: string): {
    id: string
    table_name: string
    record_id: string
    action: string
    payload: string
    local_timestamp: string
    server_timestamp: string
  } {
    return {
      id,
      table_name: 'tags',
      record_id: id,
      action: 'delete',
      payload: '{}',
      local_timestamp: '2026-01-02T00:00:00.000Z',
      server_timestamp: '2026-01-02T00:00:00.000Z',
    }
  }

  it('downloads every page of the account history', async () => {
    // #given
    storeToken('test-jwt')
    const server = installFakeSyncServer({ pageSize: 2 })
    server.entries.push(tagDelete('e-1'), tagDelete('e-2'), tagDelete('e-3'))

    // #when
    const result = await pullAllEntries()

    // #then
    expect(result.success && result.data.map((e) => e.id)).toEqual(['e-1', 'e-2', 'e-3'])
  })

  it('fails when a page fails', async () => {
    // #given
    storeToken('test-jwt')
    const server = installFakeSyncServer({ pageSize: 2, failPullNumber: 2 })
    server.entries.push(tagDelete('e-1'), tagDelete('e-2'), tagDelete('e-3'))

    // #when
    const result = await pullAllEntries()

    // #then
    expect(result.success).toBe(false)
  })

  it('fails when the server ignores the cursor', async () => {
    // #given
    storeToken('test-jwt')
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            entries: [tagDelete('e-1')],
            server_timestamp: '2026-01-05T00:00:00.000Z',
            has_more: true,
          }),
          { status: 200 },
        ),
    )

    // #when
    const result = await pullAllEntries()

    // #then
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/web && npx vitest run src/sync/api-client.test.ts -t pullAllEntries`

Expected: FAIL with `pullAllEntries is not a function`.

- [ ] **Step 3: Implement**

In `apps/web/src/sync/api-client.ts`, add after `pullEntries`:

```ts
export async function pullAllEntries(): Promise<ApiResult<SyncPullEntry[]>> {
  const entries: SyncPullEntry[] = []
  let cursor: string | null = null
  for (;;) {
    const result = await pullEntries(cursor)
    if (!result.success) return { success: false, error: result.error }

    const page = result.data.entries
    if (page.length > 0 && !isAfterCursor(page[0], cursor)) {
      return { success: false, error: 'Server returned entries at or before the cursor' }
    }
    entries.push(...page)

    const lastEntry = page[page.length - 1]
    if (!result.data.has_more || !lastEntry) return { success: true, data: entries }
    cursor = cursorAfter(lastEntry)
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/web && npx vitest run src/sync/api-client.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/sync/api-client.ts apps/web/src/sync/api-client.test.ts
git commit -m "feat(sync): download an account's full history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reconcile adopts an empty account or merges into one with data

**Files:**

- Create: `apps/web/src/sync/merge.ts`
- Modify: `apps/web/src/sync/reconcile.ts`
- Test: `apps/web/src/sync/reconcile.test.ts`

**Interfaces:**

- Consumes: `pullAllEntries` (Task 3); `applyEntries` (Task 2); `cursorAfter`, `storeSyncCursor` and `SyncPullEntry` from `api-client.ts`; `installFakeSyncServer` and `FakeSyncServer` from `test-sync-server.ts`.
- Produces:
  - `export interface ServerUser { id: string; email: string; baseCurrency: string }` in `merge.ts`. `reconcile.ts` imports it and no longer declares its own.
  - `mergeIntoAccount(db: Database, localUser: UserRow, serverUser: ServerUser, history: SyncPullEntry[]): Promise<void>`. `history` must be non-empty.
  - `reconcileAfterAuth` throws `Could not download account history: <error>` when the download fails.

- [ ] **Step 1: Update the test helpers and existing tests**

In `apps/web/src/sync/reconcile.test.ts`:

1. Replace the `mockServerPull(entryCount)` helper with `mockEmptyAccount()`, using the same body with `entries: []`. Replace every `mockServerPull(0)` call with `mockEmptyAccount()`.
2. Add `mockEmptyAccount()` as the last line of `// #given` in these four tests, which reach the adopt path and now always download:
   - `'remaps user ID and logs seed data when device has expenses (Path A)'`
   - `'keeps user-created data when device has unsynced changes but no expenses'`
   - `'remaps unsynced changes to the server user when device has no expenses'`
   - `'logs a create for a seeded category that only has a pending update'`
3. Delete the test `'wipes seed data and creates server user when server account already has data (Path B)'`. The merge tests below replace it.
4. Extend the imports: from `../db/queries.js`, add `createPanel`, `getUnsyncedEntries`, `type CategoryRow` and `type PanelRow`, keeping what is already there. Add `import { installFakeSyncServer, type FakeSyncServer } from './test-sync-server.js'` and `import { getStoredSyncCursor } from './api-client.js'`.
5. Add these helpers after `mockServerPullFailure`:

```ts
const SERVER_USER = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' }
const ACCOUNT_TIMESTAMP = '2026-01-02T00:00:00.000Z'

async function createAccount(
  server: FakeSyncServer,
  edit?: (accountDb: Database) => Promise<void>,
): Promise<Database> {
  const accountDb = createTestDatabase()
  await runMigrations(accountDb)
  await seedDefaultData(accountDb, 'local@pancakemaker.app', 'USD')
  await reconcileAfterAuth(accountDb, SERVER_USER)
  if (edit) await edit(accountDb)
  const pending = await getUnsyncedEntries(accountDb)
  server.entries.push(
    ...pending.map((e) => ({
      id: e.id,
      table_name: e.table_name,
      record_id: e.record_id,
      action: e.action,
      payload: e.payload,
      local_timestamp: e.local_timestamp,
      server_timestamp: ACCOUNT_TIMESTAMP,
    })),
  )
  return accountDb
}

async function idsIn(database: Database, table: string): Promise<string[]> {
  const rows = await database.query<{ id: string }>(`SELECT id FROM ${table} ORDER BY id`)
  return rows.map((r) => r.id)
}

async function routeId(database: Database, type: 'personal' | 'business'): Promise<string> {
  const rows = await database.query<{ id: string }>('SELECT id FROM routes WHERE type = ?', [type])
  return rows[0].id
}

async function categoryIn(
  database: Database,
  type: 'personal' | 'business',
  name: string,
): Promise<CategoryRow | undefined> {
  const rows = await database.query<CategoryRow>(
    'SELECT c.* FROM categories c JOIN routes r ON r.id = c.route_id WHERE r.type = ? AND c.name = ?',
    [type, name],
  )
  return rows[0]
}

async function panelIn(
  database: Database,
  type: 'personal' | 'business',
  name: string,
): Promise<PanelRow | undefined> {
  const rows = await database.query<PanelRow>(
    'SELECT p.* FROM panels p JOIN routes r ON r.id = p.route_id WHERE r.type = ? AND p.name = ?',
    [type, name],
  )
  return rows[0]
}

async function pendingFor(database: Database, recordId: string): Promise<string[]> {
  const rows = await database.query<{ action: string }>(
    'SELECT action FROM sync_log WHERE record_id = ? AND synced_at IS NULL',
    [recordId],
  )
  return rows.map((r) => r.action)
}
```

`createAccount` builds a realistic account. A first device seeds and adopts the empty account, and its queued entries become the server's history. `edit` adds account-side changes before the history is captured.

- [ ] **Step 2: Write the failing merge tests**

Add a new describe block at the end of `apps/web/src/sync/reconcile.test.ts`:

```ts
describe('reconcileAfterAuth merging into an account with data', () => {
  it('ends with exactly the account routes, categories and panels for a seed-only device', async () => {
    // #given
    const server = installFakeSyncServer()
    const accountDb = await createAccount(server)
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const tables = ['routes', 'categories', 'panels']
    expect(await Promise.all(tables.map((t) => idsIn(db, t)))).toEqual(
      await Promise.all(tables.map((t) => idsIn(accountDb, t))),
    )
  })

  it('queues nothing for a seed-only device', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    expect(await getUnsyncedEntries(db)).toHaveLength(0)
  })

  it('repoints a device expense to the account category with the same name, ignoring case and spaces', async () => {
    // #given
    const server = installFakeSyncServer()
    const accountDb = await createAccount(server)
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const meals = (await categoryIn(db, 'personal', 'Meals'))!
    await updateCategory(db, meals.id, { name: '  MEALS ' })
    const expense = await createExpense(db, {
      panelId: (await panelIn(db, 'personal', 'Daily'))!.id,
      categoryId: meals.id,
      amount: 500,
      currency: 'USD',
      date: '2026-01-05',
    })

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const rows = await db.query<{ category_id: string }>(
      'SELECT category_id FROM expenses WHERE id = ?',
      [expense.id],
    )
    expect(rows[0].category_id).toBe((await categoryIn(accountDb, 'personal', 'Meals'))!.id)
  })

  it('repoints a device expense to the account panel with the same name and recurrence', async () => {
    // #given
    const server = installFakeSyncServer()
    const accountDb = await createAccount(server)
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const expense = await createExpense(db, {
      panelId: (await panelIn(db, 'personal', 'Daily'))!.id,
      categoryId: (await categoryIn(db, 'personal', 'Meals'))!.id,
      amount: 500,
      currency: 'USD',
      date: '2026-01-05',
    })

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const rows = await db.query<{ panel_id: string }>(
      'SELECT panel_id FROM expenses WHERE id = ?',
      [expense.id],
    )
    expect(rows[0].panel_id).toBe((await panelIn(accountDb, 'personal', 'Daily'))!.id)
  })

  it('keeps an in-use device category the account lacks under the account route and queues it', async () => {
    // #given
    const server = installFakeSyncServer()
    const accountDb = await createAccount(server)
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const coffee = await createCategory(db, seed.personalRouteId, 'Coffee', '#6b4f3a', 99)
    await createExpense(db, {
      panelId: (await panelIn(db, 'personal', 'Daily'))!.id,
      categoryId: coffee.id,
      amount: 300,
      currency: 'USD',
      date: '2026-01-05',
    })

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const rows = await db.query<{ route_id: string }>(
      'SELECT route_id FROM categories WHERE id = ?',
      [coffee.id],
    )
    expect({ routeId: rows[0]?.route_id, queued: await pendingFor(db, coffee.id) }).toEqual({
      routeId: await routeId(accountDb, 'personal'),
      queued: ['create'],
    })
  })

  it('drops an untouched device category the account no longer has', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server, async (accountDb) => {
      const meals = (await categoryIn(accountDb, 'personal', 'Meals'))!
      const renamed = await updateCategory(accountDb, meals.id, { name: 'Food' })
      await logSyncEntry(
        accountDb,
        SERVER_USER.id,
        'categories',
        meals.id,
        'update',
        renamed as unknown as Record<string, unknown>,
      )
    })
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    expect(await categoryIn(db, 'personal', 'Meals')).toBeUndefined()
  })

  it('clears is_default on a kept device panel', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const trips = await createPanel(db, seed.personalRouteId, 'Trips', 'USD', 9, null, true)
    await logSyncEntry(
      db,
      seed.userId,
      'panels',
      trips.id,
      'create',
      trips as unknown as Record<string, unknown>,
    )

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const rows = await db.query<{ is_default: number }>(
      'SELECT is_default FROM panels WHERE id = ?',
      [trips.id],
    )
    expect(rows[0].is_default).toBe(0)
  })

  it('does not queue deletes made before sign-in', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const health = (await categoryIn(db, 'personal', 'Health'))!
    await db.execute('DELETE FROM categories WHERE id = ?', [health.id])
    await logSyncEntry(db, seed.userId, 'categories', health.id, 'delete', { id: health.id })

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const deletes = await db.query<{ id: string }>(
      "SELECT id FROM sync_log WHERE action = 'delete' AND synced_at IS NULL",
    )
    expect(deletes).toHaveLength(0)
  })

  it('queues deleted device expenses too', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const expense = await createExpense(db, {
      panelId: (await panelIn(db, 'personal', 'Daily'))!.id,
      categoryId: (await categoryIn(db, 'personal', 'Meals'))!.id,
      amount: 500,
      currency: 'USD',
      date: '2026-01-05',
    })
    await db.execute('UPDATE expenses SET deleted_at = ? WHERE id = ?', [
      '2026-01-06T00:00:00.000Z',
      expense.id,
    ])

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    expect(await pendingFor(db, expense.id)).toEqual(['create'])
  })

  it('stores the cursor of the last account entry', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const lastId = server.entries
      .map((e) => e.id)
      .sort()
      .at(-1)

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    expect(getStoredSyncCursor()).toBe(`${ACCOUNT_TIMESTAMP}|${lastId}`)
  })

  it('keeps the device route and its categories when the account lacks that route type', async () => {
    // #given
    const server = installFakeSyncServer()
    const accountDb = await createAccount(server)
    const businessRouteId = await routeId(accountDb, 'business')
    const businessRows = await accountDb.query<{ id: string }>(
      'SELECT id FROM categories WHERE route_id = ? UNION SELECT id FROM panels WHERE route_id = ?',
      [businessRouteId, businessRouteId],
    )
    const dropped = new Set([businessRouteId, ...businessRows.map((r) => r.id)])
    server.entries = server.entries.filter((e) => !dropped.has(e.record_id))
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const deviceBusinessCategories = await db.query<{ id: string }>(
      'SELECT id FROM categories WHERE route_id = ?',
      [seed.businessRouteId],
    )

    // #when
    await reconcileAfterAuth(db, SERVER_USER)

    // #then
    const kept = await db.query<{ id: string }>('SELECT id FROM categories WHERE route_id = ?', [
      seed.businessRouteId,
    ])
    expect({
      categories: kept.length,
      routeQueued: await pendingFor(db, seed.businessRouteId),
    }).toEqual({ categories: deviceBusinessCategories.length, routeQueued: ['create'] })
  })

  it('leaves the device untouched when the merge fails', async () => {
    // #given
    const server = installFakeSyncServer()
    await createAccount(server)
    const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
    const categoriesBefore = await idsIn(db, 'categories')
    const execute = db.execute.bind(db)
    vi.spyOn(db, 'execute').mockImplementation(async (sql, params) => {
      if (sql.startsWith('DELETE FROM routes')) throw new Error('boom')
      return execute(sql, params)
    })

    // #when
    await reconcileAfterAuth(db, SERVER_USER).catch(() => {})

    // #then
    vi.restoreAllMocks()
    expect({ users: await idsIn(db, 'users'), categories: await idsIn(db, 'categories') }).toEqual({
      users: [seed.userId],
      categories: categoriesBefore,
    })
  })
})
```

Add `vi` to the `vitest` import if it is not already there.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `cd apps/web && npx vitest run src/sync/reconcile.test.ts`

Expected: the merge tests FAIL against the current wipe path (Path B), which deletes the device's data and queues nothing. For example, the first test gets empty arrays, and the in-use category test gets `routeId: undefined`. `'leaves the device untouched when the merge fails'` fails because the wipe has already deleted the categories when the route delete throws.

The updated adopt tests and the download-failure tests still PASS.

- [ ] **Step 4: Create the merge module**

Create `apps/web/src/sync/merge.ts`:

```ts
import type { Database } from '../db/interface.js'
import type { UserRow, RouteRow, CategoryRow, PanelRow } from '../db/queries.js'
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

const QUEUED_TABLES = ['routes', 'categories', 'panels'] as const

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
    await removeMergedRoutes(db, routeMap)
    await queueDeviceRows(db, serverUser.id, device)
  })
  storeSyncCursor(cursorAfter(history[history.length - 1]))
}
```

- [ ] **Step 5: Route reconcile through adopt or merge**

In `apps/web/src/sync/reconcile.ts`:

- Replace the body of `reconcileAfterAuth` after the two early returns with:

```ts
const history = await pullAllEntries()
if (!history.success) {
  throw new Error(`Could not download account history: ${history.error}`)
}

if (history.data.length === 0) {
  console.log('[reconcile] account is empty, adopting this device')
  await reconcileFirstDevice(db, localUser, serverUser)
} else {
  console.log('[reconcile] account has %d entries, merging this device', history.data.length)
  await mergeIntoAccount(db, localUser, serverUser, history.data)
}
```

- Delete `serverHasData`, `hasUserCreatedData` and `reconcileSecondDevice`.
- Delete the local `interface ServerUser` and add `import { mergeIntoAccount, type ServerUser } from './merge.js'`.
- Change the `./api-client.js` import to `import { pullAllEntries } from './api-client.js'`. `clearSyncCursor` and `pullEntries` are no longer used here.

- [ ] **Step 6: Run the reconcile tests and confirm they pass**

Run: `cd apps/web && npx vitest run src/sync/reconcile.test.ts`

Expected: PASS for every test.

- [ ] **Step 7: Run the web tests and type-check**

Run: `cd apps/web && npx vitest run && npx tsc -b`

Expected: PASS and no type errors. The `Login` and `AuthVerify` tests still see the sign-in fail and the token cleared, because their mocked `fetch` returns 500 for the history download.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/sync/merge.ts apps/web/src/sync/reconcile.ts apps/web/src/sync/reconcile.test.ts
git commit -m "fix(sync): merge a device into an account that already has data

When a device with its own data signed in to an account with data, it
pushed its own personal and business routes alongside the account's. The
account ended up with two routes of each type, and whatever sat under the
route the app didn't pick stopped showing. A seed-only device instead
took a wipe path.

Sign-in now downloads the account's history once. An empty account
adopts the device as before. Otherwise, in one transaction, the device
moves to the server user and applies the history. It then maps its
routes by type and its categories and panels by name onto the account's,
repoints expenses and recurring templates, and deletes the duplicates.
Unmatched rows that are in use or were edited are kept under the
account's routes; untouched seed rows are dropped. Pending changes are
replaced with creates for what the account lacks.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Merge tags and handle account edge cases

**Files:**

- Modify: `apps/web/src/sync/merge.ts`
- Test: `apps/web/src/sync/reconcile.test.ts` (the merge describe block)

**Interfaces:**

- Consumes: `mergeIntoAccount` and its helpers (Task 4); test helpers `createAccount`, `categoryIn`, `panelIn`, `pendingFor`, `idsIn`, `SERVER_USER` and `ACCOUNT_TIMESTAMP` (Task 4).
- Produces: tag matching by name; tags included in the re-queue; the merge tolerates an email collision.

- [ ] **Step 1: Write the tests**

Add `createTag` and `addTagToExpense` to the `../db/queries.js` import in `apps/web/src/sync/reconcile.test.ts`. Then add inside the merge describe block:

```ts
it('repoints expense tags to the account tag with the same name', async () => {
  // #given
  const server = installFakeSyncServer()
  let accountTagId = ''
  await createAccount(server, async (accountDb) => {
    const tag = await createTag(accountDb, SERVER_USER.id, 'Trip')
    accountTagId = tag.id
    await logSyncEntry(
      accountDb,
      SERVER_USER.id,
      'tags',
      tag.id,
      'create',
      tag as unknown as Record<string, unknown>,
    )
  })
  const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
  const deviceTag = await createTag(db, seed.userId, ' trip')
  const expense = await createExpense(db, {
    panelId: (await panelIn(db, 'personal', 'Daily'))!.id,
    categoryId: (await categoryIn(db, 'personal', 'Meals'))!.id,
    amount: 500,
    currency: 'USD',
    date: '2026-01-05',
  })
  await addTagToExpense(db, expense.id, deviceTag.id)

  // #when
  await reconcileAfterAuth(db, SERVER_USER)

  // #then
  const rows = await db.query<{ tag_id: string }>(
    'SELECT tag_id FROM expense_tags WHERE expense_id = ?',
    [expense.id],
  )
  expect(rows.map((r) => r.tag_id)).toEqual([accountTagId])
})

it('queues a create for a device tag the account lacks', async () => {
  // #given
  const server = installFakeSyncServer()
  await createAccount(server)
  const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
  const tag = await createTag(db, seed.userId, 'Solo')

  // #when
  await reconcileAfterAuth(db, SERVER_USER)

  // #then
  expect(await pendingFor(db, tag.id)).toEqual(['create'])
})

it('merges when the device user already has the account email', async () => {
  // #given
  const server = installFakeSyncServer()
  await createAccount(server)
  const seed = await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
  await db.execute('UPDATE users SET email = ? WHERE id = ?', [SERVER_USER.email, seed.userId])

  // #when
  await reconcileAfterAuth(db, SERVER_USER)

  // #then
  expect(await idsIn(db, 'users')).toEqual([SERVER_USER.id])
})

it('maps device rows to the oldest account route of a type', async () => {
  // #given
  const server = installFakeSyncServer()
  const accountDb = await createAccount(server)
  const duplicateRoute = {
    id: 'route-duplicate',
    user_id: SERVER_USER.id,
    type: 'personal',
    created_at: '2099-01-01T00:00:00.000Z',
    updated_at: '2099-01-01T00:00:00.000Z',
  }
  server.entries.push({
    id: '9999999999999-000000-duplicate-route',
    table_name: 'routes',
    record_id: duplicateRoute.id,
    action: 'create',
    payload: JSON.stringify(duplicateRoute),
    local_timestamp: ACCOUNT_TIMESTAMP,
    server_timestamp: ACCOUNT_TIMESTAMP,
  })
  await seedDefaultData(db, 'local@pancakemaker.app', 'USD')
  const expense = await createExpense(db, {
    panelId: (await panelIn(db, 'personal', 'Daily'))!.id,
    categoryId: (await categoryIn(db, 'personal', 'Meals'))!.id,
    amount: 500,
    currency: 'USD',
    date: '2026-01-05',
  })

  // #when
  await reconcileAfterAuth(db, SERVER_USER)

  // #then
  const rows = await db.query<{ category_id: string }>(
    'SELECT category_id FROM expenses WHERE id = ?',
    [expense.id],
  )
  expect(rows[0].category_id).toBe((await categoryIn(accountDb, 'personal', 'Meals'))!.id)
})

it('merges even when an account entry fails to apply', async () => {
  // #given
  const server = installFakeSyncServer()
  await createAccount(server)
  server.entries.push({
    id: '9999999999999-000000-broken-expense',
    table_name: 'expenses',
    record_id: 'exp-broken',
    action: 'create',
    payload: JSON.stringify({
      id: 'exp-broken',
      panel_id: 'missing-panel',
      category_id: 'missing-category',
      amount: 1,
      currency: 'USD',
      date: '2026-01-02',
      is_recurring: 0,
      created_at: ACCOUNT_TIMESTAMP,
      updated_at: ACCOUNT_TIMESTAMP,
    }),
    local_timestamp: ACCOUNT_TIMESTAMP,
    server_timestamp: ACCOUNT_TIMESTAMP,
  })
  await seedDefaultData(db, 'local@pancakemaker.app', 'USD')

  // #when
  await reconcileAfterAuth(db, SERVER_USER)

  // #then
  expect(await idsIn(db, 'users')).toEqual([SERVER_USER.id])
})
```

- [ ] **Step 2: Run the tests and check which fail**

Run: `cd apps/web && npx vitest run src/sync/reconcile.test.ts -t "merging into an account"`

Expected:

- FAIL: `'repoints expense tags to the account tag with the same name'` (the device tag is untouched), `'queues a create for a device tag the account lacks'` (tags aren't queued), and `'merges when the device user already has the account email'` (the `INSERT INTO users` hits the unique email constraint, and the merge rolls back and rejects).
- PASS already: `'maps device rows to the oldest account route of a type'` and `'merges even when an account entry fails to apply'`. These pin Review Focus behavior that Task 4's code already provides (`ORDER BY created_at, id`, and `applyEntries` skipping failures).

- [ ] **Step 3: Implement tags and the email collision**

In `apps/web/src/sync/merge.ts`:

1. Add `TagRow` to the type import from `../db/queries.js`.
2. Change `QUEUED_TABLES` to `['routes', 'categories', 'panels', 'tags'] as const`.
3. Make this the first statement of `moveToServerUser`:

```ts
await db.execute('UPDATE users SET email = id WHERE id = ?', [localUser.id])
```

4. Add after `mergePanels`:

```ts
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
```

5. In `mergeIntoAccount`, call `await mergeTags(db, device)` after `mergePanels`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/web && npx vitest run src/sync && npx tsc -b`

Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/sync/merge.ts apps/web/src/sync/reconcile.test.ts
git commit -m "fix(sync): merge device tags and tolerate an email collision

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Two-device simulation, verification and PR

**Files:**

- Create: `apps/web/src/sync/two-device.test.ts`

**Interfaces:**

- Consumes: `reconcileAfterAuth` (Tasks 4–5), `createSyncEngine`, `installFakeSyncServer`, and `getStoredSyncCursor`, `storeSyncCursor` and `clearSyncCursor` from `api-client.ts`.

- [ ] **Step 1: Write the simulation test**

Create `apps/web/src/sync/two-device.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTestDatabase } from '../db/test-db.js'
import { runMigrations } from '../db/migrations.js'
import { seedDefaultData } from '../db/seed.js'
import { createCategory, createExpense } from '../db/queries.js'
import type { Database } from '../db/interface.js'
import { reconcileAfterAuth } from './reconcile.js'
import { createSyncEngine } from './sync-engine.js'
import { installFakeSyncServer } from './test-sync-server.js'
import { getStoredSyncCursor, storeSyncCursor, clearSyncCursor } from './api-client.js'

const SERVER_USER = { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' }

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('pancakemaker_jwt', 'test-token')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function createDevice(): Promise<Database> {
  const device = createTestDatabase()
  await runMigrations(device)
  await seedDefaultData(device, 'local@pancakemaker.app', 'USD')
  return device
}

async function syncOnce(device: Database): Promise<void> {
  const engine = createSyncEngine(device)
  await engine.sync(true)
  engine.stop()
}

async function idsIn(device: Database, table: string): Promise<string[]> {
  const rows = await device.query<{ id: string }>(`SELECT id FROM ${table} ORDER BY id`)
  return rows.map((r) => r.id)
}

async function snapshot(device: Database): Promise<Record<string, string[]>> {
  return {
    routes: await idsIn(device, 'routes'),
    categories: await idsIn(device, 'categories'),
    panels: await idsIn(device, 'panels'),
    expenses: await idsIn(device, 'expenses'),
  }
}

describe('two devices on one account', () => {
  it('end with the same routes, categories, panels and expenses after the second device merges', async () => {
    // #given
    installFakeSyncServer()
    const deviceA = await createDevice()
    await reconcileAfterAuth(deviceA, SERVER_USER)
    await syncOnce(deviceA)
    const cursorA = getStoredSyncCursor()
    clearSyncCursor()

    const deviceB = await createDevice()
    const personal = await deviceB.query<{ id: string }>(
      "SELECT id FROM routes WHERE type = 'personal'",
    )
    const coffee = await createCategory(deviceB, personal[0].id, 'Coffee', '#6b4f3a', 99)
    const daily = await deviceB.query<{ id: string }>(
      "SELECT id FROM panels WHERE route_id = ? AND name = 'Daily'",
      [personal[0].id],
    )
    await createExpense(deviceB, {
      panelId: daily[0].id,
      categoryId: coffee.id,
      amount: 300,
      currency: 'USD',
      date: '2026-01-05',
    })

    // #when
    await reconcileAfterAuth(deviceB, SERVER_USER)
    await syncOnce(deviceB)
    storeSyncCursor(cursorA!)
    await syncOnce(deviceA)

    // #then
    expect(await snapshot(deviceA)).toEqual(await snapshot(deviceB))
  })
})
```

- [ ] **Step 2: Run it**

Run: `cd apps/web && npx vitest run src/sync/two-device.test.ts`

Expected: PASS. It exercises Tasks 1–5 end to end, so there is no separate red step; Tasks 4 and 5 already proved each rule red-then-green. If it fails, debug the merge rather than the test, using superpowers:systematic-debugging.

- [ ] **Step 3: Full build, tests and prettier**

Run from the repo root:

```bash
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
npm run build && npm run test && npx prettier --check .
```

Expected:

- Build succeeds.
- All packages' tests pass.
- Prettier flags only untracked `.claude/session-context.md` and `.superpowers/` files.

- [ ] **Step 4: Commit, push and open the PR**

```bash
git add apps/web/src/sync/two-device.test.ts
git commit -m "test(sync): simulate two devices converging after a merge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin fix/second-device-merge
```

Open the PR against `main`. The body should cover:

- **The duplicate-route bug.**
- **The merge rules.**
- **The ordered sync log ids,** and why they matter.
- **The spec amendments:** all device expenses are queued, unmatched tags are always kept, and history is downloaded once at sign-in.
- **What's untested:** real devices against the deployed API.

End the body with the Claude Code attribution line.
