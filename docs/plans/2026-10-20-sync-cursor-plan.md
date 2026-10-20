# Sync Cursor Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pulls receive every server entry exactly once, by fixing the push-moves-cursor bug and the 1000-entry paging bug.

**Architecture:** The server accepts a compound `<server_timestamp>|<id>` cursor and orders by `(server_timestamp, id)`. The client builds the cursor from the last entry it applied, pages until `has_more` is false, never moves the cursor on push, and skips entries it pushed itself.

**Tech Stack:** Hono on Cloudflare Workers with D1 (server); React with wa-sqlite (client); Vitest; better-sqlite3 for real-SQLite tests.

**Spec:** `docs/plans/2026-10-20-sync-cursor-and-merge-design.md` (Stage 1 only; Stage 2 gets its own plan).

## Global Constraints

- Run every Node command with Node 22: `export PATH=/opt/homebrew/opt/node@22/bin:$PATH`. The default Node 26 cannot load better-sqlite3 12.x.
- Run web tests from `apps/web` and worker tests from `workers/api`. Running vitest from the repo root skips the web test setup.
- Cursor format: `<server_timestamp>|<id>`. A cursor without `|` means `(timestamp, '')`.
- The `since` query parameter keeps its exact current semantics (`server_timestamp > since`).
- Server page size stays 1000. The response shape (`entries`, `server_timestamp`, `has_more`) is unchanged.
- No local or D1 schema migrations in this stage.
- Tests use `// #given`, `// #when` and `// #then` comments, one behavior per test.
- Commits use conventional messages (`fix(sync): ...`) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before pushing, run `npx prettier --check .` from the repo root. `.claude/session-context.md` is globally gitignored and may be flagged; ignore it.

## Review Focus

- **Deploy skew.** A new client briefly reaches an old server that ignores `cursor` and keeps returning the same page with `has_more: true`. The pull must end instead of looping. Test: Task 4, "stops paging when a page leaves the cursor unchanged".
- **Pre-upgrade cursor.** A device upgraded from the old client has a bare-timestamp cursor stored. Its next pull must start at that timestamp with no gap. Test: Task 1, "starts at the cursor timestamp when the cursor has no id".
- **Cached old client.** A PWA that hasn't updated still sends `since`. Its results must be unchanged. Test: Task 1, "excludes entries at the since timestamp".
- **Failed page mid-pull.** The cursor must stay at the last applied page so the next sync resumes without skipping. Test: Task 4, "leaves the cursor at the last applied page when a later page fails".
- **Same-timestamp batch across a page boundary.** One push stamps up to 500 entries with the same `server_timestamp`. Every entry must arrive exactly once. Test: Task 1, "returns every entry exactly once when a page boundary falls inside a same-timestamp batch".

---

### Task 1: Server pull accepts a compound cursor

**Files:**

- Modify: `workers/api/package.json` (dev dependencies)
- Modify: `workers/api/tsconfig.json` (exclude the test helper)
- Create: `workers/api/src/test-d1.ts`
- Create: `workers/api/src/routes/sync.test.ts`
- Modify: `workers/api/src/routes/sync.ts` (the `GET /pull` handler)

**Interfaces:**

- Produces: `GET /sync/pull?cursor=<server_timestamp>|<id>` returns entries strictly after `(server_timestamp, id)`, ordered by `server_timestamp, id`, at most 1000. `?since=` behaves as before. No cursor and no since means everything.
- Produces (test-only): `createTestD1(): TestD1`, where `TestD1 = { db: D1Database; insertSyncEntry(entry: { id: string; user_id: string; server_timestamp: string }): void }`.

- [ ] **Step 1: Add better-sqlite3 as a worker dev dependency**

Run from the repo root:

```bash
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
npm install -D better-sqlite3@^12.6.2 @types/better-sqlite3@^7.6.13 -w @pancakemaker/api
```

Expected: `workers/api/package.json` lists both under `devDependencies`, and `package-lock.json` changes only to record them.

- [ ] **Step 2: Exclude the test helper from the worker build**

In `workers/api/tsconfig.json`, change the exclude line to:

```json
  "exclude": ["src/**/*.test.ts", "src/test-d1.ts"],
```

- [ ] **Step 3: Create the real-SQLite D1 test helper**

Create `workers/api/src/test-d1.ts`:

```ts
import { readFileSync } from 'node:fs'
import BetterSqlite3 from 'better-sqlite3'

export interface TestD1 {
  db: D1Database
  insertSyncEntry(entry: { id: string; user_id: string; server_timestamp: string }): void
}

export function createTestD1(): TestD1 {
  const sqlite = new BetterSqlite3(':memory:')
  sqlite.exec(
    readFileSync(new URL('../migrations/0001_initial_schema.sql', import.meta.url), 'utf8'),
  )

  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql)
      return {
        bind: (...params: unknown[]) => ({
          all: async () => ({ results: statement.all(...params) }),
        }),
      }
    },
  } as unknown as D1Database

  const insert = sqlite.prepare(
    `INSERT INTO sync_log (id, user_id, table_name, record_id, action, payload, local_timestamp, server_timestamp, synced_at)
     VALUES (?, ?, 'expenses', ?, 'create', '{}', ?, ?, ?)`,
  )

  return {
    db,
    insertSyncEntry: ({ id, user_id, server_timestamp }) => {
      insert.run(id, user_id, id, server_timestamp, server_timestamp, server_timestamp)
    },
  }
}
```

- [ ] **Step 4: Write the failing route tests**

Create `workers/api/src/routes/sync.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { sign } from 'hono/jwt'
import app from '../index.js'
import { createTestD1, type TestD1 } from '../test-d1.js'

const JWT_SECRET = 'test-secret-key-for-testing'
const USER_ID = 'user-1'

interface PullBody {
  entries: { id: string; server_timestamp: string }[]
  has_more: boolean
}

let d1: TestD1

beforeEach(() => {
  d1 = createTestD1()
})

async function pull(query: string): Promise<PullBody> {
  const now = Math.floor(Date.now() / 1000)
  const jwt = await sign({ sub: USER_ID, iat: now, exp: now + 3600 }, JWT_SECRET)
  const res = await app.request(
    `/sync/pull?${query}`,
    { headers: { Authorization: `Bearer ${jwt}` } },
    { DB: d1.db, JWT_SECRET },
  )
  return res.json() as Promise<PullBody>
}

describe('GET /sync/pull with a cursor', () => {
  it('returns every entry exactly once when a page boundary falls inside a same-timestamp batch', async () => {
    // #given
    const ids = Array.from({ length: 1001 }, (_, i) => `e-${String(i).padStart(4, '0')}`)
    for (const id of ids) {
      d1.insertSyncEntry({ id, user_id: USER_ID, server_timestamp: '2026-03-01T00:00:00.000Z' })
    }

    // #when
    const first = await pull(`cursor=${encodeURIComponent('1970-01-01T00:00:00.000Z|')}`)
    const last = first.entries[first.entries.length - 1]
    const second = await pull(`cursor=${encodeURIComponent(`${last.server_timestamp}|${last.id}`)}`)

    // #then
    expect([...first.entries, ...second.entries].map((e) => e.id)).toEqual(ids)
  })

  it('starts at the cursor timestamp when the cursor has no id', async () => {
    // #given
    d1.insertSyncEntry({
      id: 'before',
      user_id: USER_ID,
      server_timestamp: '2026-03-01T00:00:00.000Z',
    })
    d1.insertSyncEntry({ id: 'at', user_id: USER_ID, server_timestamp: '2026-03-02T00:00:00.000Z' })
    d1.insertSyncEntry({
      id: 'after',
      user_id: USER_ID,
      server_timestamp: '2026-03-03T00:00:00.000Z',
    })

    // #when
    const body = await pull(`cursor=${encodeURIComponent('2026-03-02T00:00:00.000Z')}`)

    // #then
    expect(body.entries.map((e) => e.id)).toEqual(['at', 'after'])
  })
})

describe('GET /sync/pull with since', () => {
  it('excludes entries at the since timestamp', async () => {
    // #given
    d1.insertSyncEntry({ id: 'at', user_id: USER_ID, server_timestamp: '2026-03-02T00:00:00.000Z' })
    d1.insertSyncEntry({
      id: 'after',
      user_id: USER_ID,
      server_timestamp: '2026-03-03T00:00:00.000Z',
    })

    // #when
    const body = await pull(`since=${encodeURIComponent('2026-03-02T00:00:00.000Z')}`)

    // #then
    expect(body.entries.map((e) => e.id)).toEqual(['after'])
  })
})
```

- [ ] **Step 5: Run the tests and confirm the cursor tests fail**

Run: `cd workers/api && npx vitest run src/routes/sync.test.ts`

Expected:

- The two cursor tests FAIL. The server ignores `cursor` and returns everything since 1970: the first test gets 2000 ids, the second gets `['before', 'at', 'after']`.
- The `since` test PASSES. It pins existing behavior.

- [ ] **Step 6: Implement the cursor in the pull handler**

In `workers/api/src/routes/sync.ts`, replace the whole `syncRoutes.get('/pull', ...)` handler with:

```ts
const PULL_PAGE_SIZE = 1000
const PULL_COLUMNS = 'id, table_name, record_id, action, payload, local_timestamp, server_timestamp'

interface PullRow {
  id: string
  table_name: string
  record_id: string
  action: string
  payload: string
  local_timestamp: string
  server_timestamp: string
}

function decodeCursor(cursor: string): { timestamp: string; id: string } {
  const separator = cursor.lastIndexOf('|')
  if (separator === -1) return { timestamp: cursor, id: '' }
  return { timestamp: cursor.slice(0, separator), id: cursor.slice(separator + 1) }
}

function pullStatement(
  db: D1Database,
  userId: string,
  cursor: string | undefined,
  since: string,
): D1PreparedStatement {
  if (cursor === undefined) {
    return db
      .prepare(
        `SELECT ${PULL_COLUMNS} FROM sync_log
         WHERE user_id = ? AND server_timestamp > ?
         ORDER BY server_timestamp ASC, id ASC
         LIMIT ${PULL_PAGE_SIZE}`,
      )
      .bind(userId, since)
  }

  const position = decodeCursor(cursor)
  return db
    .prepare(
      `SELECT ${PULL_COLUMNS} FROM sync_log
       WHERE user_id = ? AND (server_timestamp > ? OR (server_timestamp = ? AND id > ?))
       ORDER BY server_timestamp ASC, id ASC
       LIMIT ${PULL_PAGE_SIZE}`,
    )
    .bind(userId, position.timestamp, position.timestamp, position.id)
}

syncRoutes.get('/pull', async (c) => {
  const statement = pullStatement(
    c.env.DB,
    c.get('userId'),
    c.req.query('cursor'),
    c.req.query('since') ?? '1970-01-01T00:00:00.000Z',
  )
  const { results } = await statement.all<PullRow>()

  return c.json({
    entries: results,
    server_timestamp: new Date().toISOString(),
    has_more: results.length === PULL_PAGE_SIZE,
  })
})
```

- [ ] **Step 7: Run the worker tests and confirm they pass**

Run: `cd workers/api && npx vitest run`

Expected: PASS for all three new tests and every existing test in `src/index.test.ts`. Its mocked `GET /sync/pull` test still works because the handler keeps the `prepare().bind().all()` chain.

- [ ] **Step 8: Type-check the worker**

Run: `cd workers/api && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add workers/api/package.json package-lock.json workers/api/tsconfig.json workers/api/src/test-d1.ts workers/api/src/routes/sync.test.ts workers/api/src/routes/sync.ts
git commit -m "fix(sync): page pulls with a (server_timestamp, id) cursor

Pulls returned at most 1000 entries ordered by server_timestamp alone, and
one push stamps up to 500 entries with the same timestamp. Paging by
timestamp could skip entries that share it at a page boundary. Accept a
compound cursor and order by (server_timestamp, id) so every entry is
returned exactly once. The since parameter keeps its behavior for clients
that haven't updated.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Client sends the cursor and can build one from an entry

**Files:**

- Modify: `apps/web/src/sync/api-client.ts` (`pullEntries`, new `cursorAfter`)
- Test: `apps/web/src/sync/api-client.test.ts` (the `pullEntries` describe block)

**Interfaces:**

- Consumes: the Task 1 server contract.
- Produces: `pullEntries(cursor?: string | null): Promise<ApiResult<PullResult>>` sends `?cursor=` (and no parameter when the cursor is null or empty). `cursorAfter(entry: Pick<SyncPullEntry, 'server_timestamp' | 'id'>): string` returns `` `${entry.server_timestamp}|${entry.id}` ``.

- [ ] **Step 1: Rewrite the pullEntries URL tests and add a cursorAfter test**

In `apps/web/src/sync/api-client.test.ts`, add `cursorAfter` to the import list from `./api-client.js`. Then replace the tests `'fetches entries with since parameter'` and `'fetches without since parameter when null'` with:

```ts
it('sends the cursor as a query parameter', async () => {
  // #given
  storeToken('test-jwt')
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        entries: [],
        server_timestamp: '2026-02-26T00:00:01.000Z',
        has_more: false,
      }),
      { status: 200 },
    ),
  )

  // #when
  await pullEntries('2026-02-26T00:00:00.000Z|e-1')

  // #then
  const [url] = fetchSpy.mock.calls[0]
  expect(url).toContain('cursor=2026-02-26T00%3A00%3A00.000Z%7Ce-1')
})

it('omits the cursor when null', async () => {
  // #given
  storeToken('test-jwt')
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        entries: [],
        server_timestamp: '2026-02-26T00:00:00.000Z',
        has_more: false,
      }),
      { status: 200 },
    ),
  )

  // #when
  await pullEntries(null)

  // #then
  const [url] = fetchSpy.mock.calls[0]
  expect(url).not.toContain('cursor=')
})
```

Add after the `pullEntries` describe block:

```ts
describe('cursorAfter', () => {
  it('builds a cursor from the entry timestamp and id', () => {
    // #given
    const entry = { server_timestamp: '2026-03-01T00:00:00.000Z', id: 'e-1' }

    // #when
    const cursor = cursorAfter(entry)

    // #then
    expect(cursor).toBe('2026-03-01T00:00:00.000Z|e-1')
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/web && npx vitest run src/sync/api-client.test.ts`

Expected: FAIL. `'sends the cursor as a query parameter'` fails because the URL contains `since=`, and `'builds a cursor from the entry timestamp and id'` fails with `cursorAfter is not a function`. `'omits the cursor when null'` passes already, since no parameter is sent for null.

- [ ] **Step 3: Implement**

In `apps/web/src/sync/api-client.ts`, replace `pullEntries` with the code below and add `cursorAfter` directly above it:

```ts
export function cursorAfter(entry: Pick<SyncPullEntry, 'server_timestamp' | 'id'>): string {
  return `${entry.server_timestamp}|${entry.id}`
}

export async function pullEntries(cursor?: string | null): Promise<ApiResult<PullResult>> {
  const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return apiRequest<PullResult>(`/sync/pull${params}`)
}
```

- [ ] **Step 4: Run the web sync tests and confirm they pass**

Run: `cd apps/web && npx vitest run src/sync`

Expected: PASS. That includes `sync-engine.test.ts` and `reconcile.test.ts`, which mock `fetch` without asserting on the pull URL.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/sync/api-client.ts apps/web/src/sync/api-client.test.ts
git commit -m "fix(sync): send the pull cursor as a compound cursor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Push no longer moves the pull cursor

**Files:**

- Create: `apps/web/src/sync/test-sync-server.ts`
- Modify: `apps/web/tsconfig.json` (exclude the test helper)
- Modify: `apps/web/src/sync/sync-engine.ts` (`push()`)
- Test: `apps/web/src/sync/sync-engine.test.ts`

**Interfaces:**

- Consumes: `cursorAfter` and `pullEntries` from Task 2.
- Produces (test-only): `installFakeSyncServer(options?: { pageSize?: number; pushTimestamp?: string; failPullNumber?: number }): FakeSyncServer`, where `FakeSyncServer = { entries: SyncPullEntry[]; pullCursors: (string | null)[] }`.
  - It replaces `fetch` with an in-memory server implementing Task 1's cursor semantics.
  - `failPullNumber` makes the Nth pull request return HTTP 500 (1-based).
- Produces (test file): `routeId: string` captured in `beforeEach`, `remoteCategoryEntry(id: string, serverTimestamp: string): SyncPullEntry`, and `categoryIds(): Promise<string[]>`.

- [ ] **Step 1: Create the fake sync server**

Create `apps/web/src/sync/test-sync-server.ts`:

```ts
import { vi } from 'vitest'
import type { SyncPullEntry, SyncPushEntry } from './api-client.js'

export interface FakeSyncServer {
  entries: SyncPullEntry[]
  pullCursors: (string | null)[]
}

interface FakeSyncServerOptions {
  pageSize?: number
  pushTimestamp?: string
  failPullNumber?: number
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function splitCursor(cursor: string | null): [string, string] {
  if (cursor === null) return ['', '']
  const separator = cursor.lastIndexOf('|')
  if (separator === -1) return [cursor, '']
  return [cursor.slice(0, separator), cursor.slice(separator + 1)]
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

export function installFakeSyncServer(options: FakeSyncServerOptions = {}): FakeSyncServer {
  const pageSize = options.pageSize ?? 1000
  const server: FakeSyncServer = { entries: [], pullCursors: [] }

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))

    if (url.pathname === '/sync/push') {
      const { entries } = JSON.parse(String(init?.body)) as { entries: SyncPushEntry[] }
      const serverTimestamp = options.pushTimestamp ?? new Date().toISOString()
      for (const entry of entries) {
        server.entries.push({ ...entry, server_timestamp: serverTimestamp })
      }
      return jsonResponse({ ok: true, synced: entries.length, server_timestamp: serverTimestamp })
    }

    if (url.pathname === '/sync/pull') {
      const cursor = url.searchParams.get('cursor')
      server.pullCursors.push(cursor)
      if (server.pullCursors.length === options.failPullNumber) {
        return jsonResponse({ error: 'Server error' }, 500)
      }
      const [timestamp, id] = splitCursor(cursor)
      const page = [...server.entries]
        .sort(
          (a, b) =>
            compareStrings(a.server_timestamp, b.server_timestamp) || compareStrings(a.id, b.id),
        )
        .filter(
          (e) => e.server_timestamp > timestamp || (e.server_timestamp === timestamp && e.id > id),
        )
        .slice(0, pageSize)
      return jsonResponse({
        entries: page,
        server_timestamp: new Date().toISOString(),
        has_more: page.length === pageSize,
      })
    }

    return jsonResponse({ error: 'Not found' }, 404)
  })

  return server
}
```

- [ ] **Step 2: Exclude it from the web build**

In `apps/web/tsconfig.json`, add `"src/sync/test-sync-server.ts"` to the `exclude` array after `"src/test-setup.ts"`.

- [ ] **Step 3: Write the failing test**

In `apps/web/src/sync/sync-engine.test.ts`:

1. Add the imports:

   ```ts
   import { installFakeSyncServer } from './test-sync-server.js'
   import type { SyncPullEntry } from './api-client.js'
   ```

2. Add `let routeId: string` next to `let userId: string`. In `beforeEach`, replace `await createRoute(db, userId, 'personal')` with:

   ```ts
   const route = await createRoute(db, userId, 'personal')
   routeId = route.id
   ```

3. Add these helpers below `afterEach`:

   ```ts
   function remoteCategoryEntry(id: string, serverTimestamp: string): SyncPullEntry {
     return {
       id: `entry-${id}`,
       table_name: 'categories',
       record_id: id,
       action: 'create',
       payload: JSON.stringify({
         id,
         route_id: routeId,
         name: `Remote ${id}`,
         color: '#ffffff',
         sort_order: 0,
         created_at: serverTimestamp,
         updated_at: serverTimestamp,
       }),
       local_timestamp: serverTimestamp,
       server_timestamp: serverTimestamp,
     }
   }

   async function categoryIds(): Promise<string[]> {
     const rows = await db.query<{ id: string }>('SELECT id FROM categories ORDER BY id')
     return rows.map((r) => r.id)
   }
   ```

4. Add a new describe block at the end of the file:

   ```ts
   describe('sync cursor', () => {
     it('receives a change another device pushed before this device pushes', async () => {
       // #given
       vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
       localStorage.setItem('pancakemaker_jwt', 'test-token')
       localStorage.setItem('pancakemaker_last_sync', '2026-01-01T00:00:00.000Z|')
       const server = installFakeSyncServer({ pushTimestamp: '2026-01-03T00:00:00.000Z' })
       server.entries.push(remoteCategoryEntry('cat-remote', '2026-01-02T00:00:00.000Z'))
       await logSyncEntry(db, userId, 'tags', 'tag-1', 'delete', { id: 'tag-1' })
       const engine = createSyncEngine(db)

       // #when
       await engine.sync(true)
       engine.stop()

       // #then
       expect(await categoryIds()).toEqual(['cat-remote'])
     })
   })
   ```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `cd apps/web && npx vitest run src/sync/sync-engine.test.ts -t "receives a change another device pushed"`

Expected: FAIL with `expected [] to deeply equal [ 'cat-remote' ]`. The push stored `2026-01-03…` as the cursor, so the pull skipped the Jan 2 entry.

- [ ] **Step 5: Remove the cursor write from push**

In `apps/web/src/sync/sync-engine.ts`, inside `push()`, delete this line:

```ts
storeSyncCursor(result.data.server_timestamp)
```

- [ ] **Step 6: Run the sync-engine tests and confirm they pass**

Run: `cd apps/web && npx vitest run src/sync/sync-engine.test.ts`

Expected: PASS for the new test and all existing ones. `'pushes unsynced entries to server'` still makes 3 fetch calls: the cursor now comes from `getLastSyncTimestamp`, which is non-null after the push, so the stale-cursor retry still runs.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/sync/test-sync-server.ts apps/web/tsconfig.json apps/web/src/sync/sync-engine.ts apps/web/src/sync/sync-engine.test.ts
git commit -m "fix(sync): stop push from moving the pull cursor

After a successful push the engine stored the push's server time as the
pull cursor. Any change another device pushed after this device's last
pull was then skipped for good whenever this device had something to push.
Only pull advances the cursor now.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pull pages until the server has no more

**Files:**

- Modify: `apps/web/src/sync/sync-engine.ts` (`pull()`, new `applyEntries()`)
- Test: `apps/web/src/sync/sync-engine.test.ts` (the `sync cursor` describe block)

**Interfaces:**

- Consumes: `cursorAfter` and `pullEntries(cursor)` from Task 2; `installFakeSyncServer`, `remoteCategoryEntry` and `categoryIds` from Task 3.
- Produces: after a successful pull, the stored cursor is `cursorAfter(lastAppliedEntry)`. After a failed page, the stored cursor is the last entry of the last page that was applied.

- [ ] **Step 1: Write the failing tests**

Add `getStoredSyncCursor` to the imports at the top of `apps/web/src/sync/sync-engine.test.ts`:

```ts
import { getStoredSyncCursor } from './api-client.js'
```

Add inside the `sync cursor` describe block:

```ts
it('applies every page when the server has more than one page', async () => {
  // #given
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  localStorage.setItem('pancakemaker_jwt', 'test-token')
  const server = installFakeSyncServer({ pageSize: 2 })
  server.entries.push(
    remoteCategoryEntry('cat-1', '2026-01-02T00:00:00.000Z'),
    remoteCategoryEntry('cat-2', '2026-01-02T00:00:00.000Z'),
    remoteCategoryEntry('cat-3', '2026-01-02T00:00:00.000Z'),
  )
  const engine = createSyncEngine(db)

  // #when
  await engine.sync(true)
  engine.stop()

  // #then
  expect(await categoryIds()).toEqual(['cat-1', 'cat-2', 'cat-3'])
})

it('stores the cursor of the last applied entry', async () => {
  // #given
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  localStorage.setItem('pancakemaker_jwt', 'test-token')
  const server = installFakeSyncServer()
  server.entries.push(remoteCategoryEntry('cat-1', '2026-01-02T00:00:00.000Z'))
  const engine = createSyncEngine(db)

  // #when
  await engine.sync(true)
  engine.stop()

  // #then
  expect(getStoredSyncCursor()).toBe('2026-01-02T00:00:00.000Z|entry-cat-1')
})

it('stops paging when a page leaves the cursor unchanged', async () => {
  // #given
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  localStorage.setItem('pancakemaker_jwt', 'test-token')
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          entries: [remoteCategoryEntry('cat-1', '2026-01-02T00:00:00.000Z')],
          server_timestamp: '2026-01-05T00:00:00.000Z',
          has_more: true,
        }),
        { status: 200 },
      ),
  )
  const engine = createSyncEngine(db)

  // #when
  await engine.sync(true)
  engine.stop()

  // #then
  expect(fetchSpy).toHaveBeenCalledTimes(2)
})

it('leaves the cursor at the last applied page when a later page fails', async () => {
  // #given
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  localStorage.setItem('pancakemaker_jwt', 'test-token')
  const server = installFakeSyncServer({ pageSize: 2, failPullNumber: 2 })
  server.entries.push(
    remoteCategoryEntry('cat-1', '2026-01-02T00:00:00.000Z'),
    remoteCategoryEntry('cat-2', '2026-01-02T00:00:00.000Z'),
    remoteCategoryEntry('cat-3', '2026-01-02T00:00:00.000Z'),
  )
  const engine = createSyncEngine(db)

  // #when
  await engine.sync(true)
  engine.stop()

  // #then
  expect(getStoredSyncCursor()).toBe('2026-01-02T00:00:00.000Z|entry-cat-2')
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/web && npx vitest run src/sync/sync-engine.test.ts -t "sync cursor"`

Expected: the four new tests FAIL.

- **Every page:** only `['cat-1', 'cat-2']` is applied.
- **Last applied entry:** the stored cursor is the server's response time.
- **Unchanged cursor:** `fetch` is called once.
- **Later page fails:** the stored cursor is the server's response time.

The Task 3 test still passes.

- [ ] **Step 3: Implement paging**

In `apps/web/src/sync/sync-engine.ts`:

1. Add `cursorAfter` to the import list from `./api-client.js`.

2. Add this function directly above `pull()`. It is the existing sort-and-apply loop moved out of `pull()`:

   ```ts
   async function applyEntries(
     entries: SyncPullEntry[],
     appliedTables: Set<string>,
   ): Promise<number> {
     const sorted = [...entries].sort((a, b) => {
       const pa = TABLE_PRIORITY[a.table_name] ?? 99
       const pb = TABLE_PRIORITY[b.table_name] ?? 99
       return pa - pb
     })

     let applied = 0
     for (let i = 0; i < sorted.length; i += PULL_BATCH_SIZE) {
       const batch = sorted.slice(i, i + PULL_BATCH_SIZE)
       for (const entry of batch) {
         try {
           await applyRemoteEntry(entry)
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
       if (i + PULL_BATCH_SIZE < sorted.length) await yieldToMain()
     }
     return applied
   }
   ```

3. Replace the whole `pull()` function with:

   ```ts
   async function pull(): Promise<boolean> {
     let cursor = getStoredSyncCursor() ?? (await getLastSyncTimestamp(db))
     console.log('[sync] pull: cursor=%s', cursor)
     let wipedLocalData = false

     let result = await pullEntries(cursor)
     if (!result.success) {
       console.log('[sync] pull failed:', result.error)
       return false
     }

     if (result.data.entries.length === 0 && cursor) {
       const expenses = await db.query<{ id: string }>(
         'SELECT id FROM expenses WHERE deleted_at IS NULL LIMIT 1',
       )
       if (expenses.length === 0) {
         console.log('[sync] stale cursor detected, retrying full pull')
         clearSyncCursor()
         cursor = null
         result = await pullEntries(null)
         if (!result.success) return false

         if (result.data.entries.length > 0) {
           console.log(
             '[sync] full pull got %d entries, wiping local seed data',
             result.data.entries.length,
           )
           wipedLocalData = true
           await db.execute('PRAGMA foreign_keys=OFF')
           try {
             await db.execute('DELETE FROM expense_tags')
             await db.execute('DELETE FROM recurring_templates')
             await db.execute('DELETE FROM expenses')
             await db.execute('DELETE FROM categories')
             await db.execute('DELETE FROM panels')
             await db.execute('DELETE FROM routes')
             await db.execute('DELETE FROM tags')
           } finally {
             await db.execute('PRAGMA foreign_keys=ON')
           }
         }
       }
     }

     let received = 0
     let applied = 0
     const appliedTables = new Set<string>()
     for (;;) {
       const { entries, has_more: hasMore } = result.data
       received += entries.length
       applied += await applyEntries(entries, appliedTables)

       const lastEntry = entries[entries.length - 1]
       const nextCursor = lastEntry ? cursorAfter(lastEntry) : cursor
       if (nextCursor && nextCursor !== cursor) storeSyncCursor(nextCursor)
       if (!hasMore || nextCursor === cursor) break

       cursor = nextCursor
       result = await pullEntries(cursor)
       if (!result.success) {
         console.log('[sync] pull failed:', result.error)
         return false
       }
     }

     console.log('[sync] pull: applied %d/%d entries', applied, received)

     if (applied > 0 || wipedLocalData) {
       await yieldToMain()
       const tables = wipedLocalData ? new Set(Object.keys(TABLE_PRIORITY)) : appliedTables
       for (const fn of dataListeners) fn(tables)
     }

     return true
   }
   ```

- [ ] **Step 4: Run the sync-engine tests and confirm they pass**

Run: `cd apps/web && npx vitest run src/sync/sync-engine.test.ts`

Expected: PASS for all tests, including the existing `'notifies dataListeners with all tables on stale cursor recovery'`.

- [ ] **Step 5: Type-check the web app**

Run: `cd apps/web && npx tsc -b`

Expected: no errors. If TypeScript doesn't narrow `result` inside the loop, add `if (!result.success) return false` as the first line of the loop body rather than adding a cast.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/sync/sync-engine.ts apps/web/src/sync/sync-engine.test.ts
git commit -m "fix(sync): page through pulls instead of skipping past has_more

When the server returned a full page with has_more, the engine stored the
server's current time as the cursor, so a fresh device on an account with
more than 1000 log entries never received the rest. Pull now applies each
page, stores the cursor of its last entry, and fetches the next page until
has_more is false. It stops early if a page leaves the cursor unchanged,
which happens if a new client reaches an old server during a deploy.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Skip entries this device pushed itself

**Files:**

- Modify: `apps/web/src/db/queries.ts` (new `getExistingSyncLogIds`)
- Modify: `apps/web/src/sync/sync-engine.ts` (`applyEntries()`)
- Test: `apps/web/src/sync/sync-engine.test.ts` (the `sync cursor` describe block)

**Interfaces:**

- Consumes: `applyEntries` from Task 4; `installFakeSyncServer` from Task 3.
- Produces: `getExistingSyncLogIds(db: Database, ids: string[]): Promise<Set<string>>` returns the subset of `ids` present in local `sync_log`. It queries in chunks of 500.

- [ ] **Step 1: Write the failing test**

In `apps/web/src/sync/sync-engine.test.ts`, extend the `../db/queries.js` import to:

```ts
import {
  createUser,
  createRoute,
  createCategory,
  updateCategory,
  logSyncEntry,
  getUnsyncedEntries,
  markEntriesSynced,
} from '../db/queries.js'
```

Add inside the `sync cursor` describe block:

```ts
it("does not re-apply this device's own pushed entries", async () => {
  // #given
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  localStorage.setItem('pancakemaker_jwt', 'test-token')
  localStorage.setItem('pancakemaker_last_sync', '2026-01-01T00:00:00.000Z|')
  const category = await createCategory(db, routeId, 'Older', '#ffffff', 0)
  await logSyncEntry(db, userId, 'categories', category.id, 'update', {
    id: category.id,
    name: 'Older',
  })
  const [ownEntry] = await getUnsyncedEntries(db)
  await markEntriesSynced(db, [ownEntry.id])
  await updateCategory(db, category.id, { name: 'Newest' })
  const server = installFakeSyncServer()
  server.entries.push({
    id: ownEntry.id,
    table_name: ownEntry.table_name,
    record_id: ownEntry.record_id,
    action: ownEntry.action,
    payload: ownEntry.payload,
    local_timestamp: ownEntry.local_timestamp,
    server_timestamp: '2026-01-02T00:00:00.000Z',
  })
  const engine = createSyncEngine(db)

  // #when
  await engine.sync(true)
  engine.stop()

  // #then
  const rows = await db.query<{ name: string }>('SELECT name FROM categories WHERE id = ?', [
    category.id,
  ])
  expect(rows[0].name).toBe('Newest')
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/web && npx vitest run src/sync/sync-engine.test.ts -t "own pushed entries"`

Expected: FAIL with `expected 'Older' to be 'Newest'`, because the device re-applied its own older update.

- [ ] **Step 3: Add the query**

In `apps/web/src/db/queries.ts`, add directly after `markEntriesSynced`:

```ts
export async function getExistingSyncLogIds(db: Database, ids: string[]): Promise<Set<string>> {
  const existing = new Set<string>()
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    const placeholders = chunk.map(() => '?').join(', ')
    const rows = await db.query<{ id: string }>(
      `SELECT id FROM sync_log WHERE id IN (${placeholders})`,
      chunk,
    )
    for (const row of rows) existing.add(row.id)
  }
  return existing
}
```

- [ ] **Step 4: Skip own entries in applyEntries**

In `apps/web/src/sync/sync-engine.ts`:

1. Add `getExistingSyncLogIds` to the import list from `../db/queries.js`.

2. In `applyEntries`, replace the first statement (`const sorted = [...entries].sort(...)`) with:

   ```ts
   const ownEntryIds = await getExistingSyncLogIds(
     db,
     entries.map((e) => e.id),
   )
   const sorted = entries
     .filter((e) => !ownEntryIds.has(e.id))
     .sort((a, b) => {
       const pa = TABLE_PRIORITY[a.table_name] ?? 99
       const pb = TABLE_PRIORITY[b.table_name] ?? 99
       return pa - pb
     })
   ```

- [ ] **Step 5: Run the sync tests and confirm they pass**

Run: `cd apps/web && npx vitest run src/sync`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/db/queries.ts apps/web/src/sync/sync-engine.ts apps/web/src/sync/sync-engine.test.ts
git commit -m "fix(sync): skip re-applying this device's own pushed entries

Now that push no longer moves the cursor, a pull returns the entries this
device just pushed. Re-applying an older one could overwrite a newer local
edit made in between. Skip entries whose id is already in the local
sync_log.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification and PR

**Files:** none changed (verification only).

- [ ] **Step 1: Build and run the full test suite**

Run from the repo root:

```bash
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
npm run build && npm run test
```

Expected: build succeeds; every package's tests pass (web, api, shared).

- [ ] **Step 2: Prettier**

Run from the repo root: `npx prettier --check .`

Expected: only `.claude/session-context.md` is flagged (globally gitignored). If any tracked file is flagged, run `npx prettier --write <file>` and amend the commit that introduced it.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin fix/sync-cursor-pagination
gh pr create --base main --title "fix(sync): stop pulls from skipping entries" --body-file <body>
```

The PR body should cover:

- **The two bugs:** push moving the cursor, and skipping past `has_more`.
- **The cursor contract:** `<server_timestamp>|<id>`, plus the bare-timestamp case.
- **The deploy-skew guard.**
- **The new worker dev dependency:** better-sqlite3, used for real-SQLite route tests.
- **Not tested:** real devices against the deployed API.

End the body with the Claude Code attribution line.
