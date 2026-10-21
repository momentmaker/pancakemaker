# Sync Cursor Correctness and Second-Device Merge

## Problem

Three defects make cross-device sync lose or hide data.

1. **Push moves the pull cursor.** After a successful push, `push()` stores the server's current time as the pull cursor (`sync-engine.ts`). Changes another device pushed after this device's last pull are skipped for good whenever this device has local changes to push.
2. **Pages past the first 1000 entries are skipped.** `GET /sync/pull` returns at most 1000 entries with `has_more`. The client then stores the server's current time as the cursor, so a fresh device on an account with more than 1000 log entries never receives the rest.
3. **A second device with local data duplicates routes.** When a device that already holds user data signs in to an account that has data, reconcile keeps the device's data and pushes its own personal and business routes, categories and panels. The account ends up with two routes of each type. The app picks one in undefined order, and everything under the other stops showing.

Both cursor bugs were confirmed by probing the sync engine. The duplicate-route behavior follows from `reconcileFirstDevice` pushing every local route, category and panel.

## Approach

Two stages, each its own PR.

- **Stage 1** makes the cursor correct: a compound `(server_timestamp, id)` cursor issued by the server, advanced only by pull, with paging until `has_more` is false.
- **Stage 2** replaces the reconcile branches with two paths, adopting the device's data when the account is empty and merging it when the account has data. The merge downloads the account history at sign-in (using stage 1 paging), applies it to the local DB, then merges the device's rows into the account's rows in one transaction.

Server-side merging was rejected because the server only relays logs and has no notion of current state. An in-memory merge snapshot was rejected because it would duplicate the log-replay logic the sync engine already has.

## Design: Stage 1, Cursor Correctness

### Server: `GET /sync/pull`

- New optional `cursor` query parameter: `<server_timestamp>|<id>`.
- With `cursor`: return entries where `(server_timestamp, id)` is strictly greater than the cursor, ordered by `server_timestamp, id`, limited to 1000.
- A cursor without `|` (a bare timestamp stored by older clients) is read as `(timestamp, '')`. The empty id sorts before every real id, so the pull starts exactly at that timestamp.
- `since` keeps its current behavior, so clients that haven't updated still work.
- The response shape is unchanged. Every entry already carries `server_timestamp` and `id`, so the client builds the next cursor itself.

### Client: `api-client.ts`

- `pullEntries` sends the stored cursor as `cursor`.
- `cursorAfter(entry)` builds `<server_timestamp>|<id>` from a pulled entry.

### Client: `sync-engine.ts`

- `push()` no longer writes the cursor.
- `pull()` loops: fetch a page, apply it, store the cursor of its last entry, and repeat while `has_more` is true. The cursor advances only after a page is applied, so an interrupted pull resumes instead of skipping.
- With no stored cursor, `pull()` starts from the beginning of the account's history. The old fallback to the newest local `synced_at` is removed: it is a local clock time, and every push moves it.
- A page whose first entry is not after the cursor is not applied, and the pull fails like any other failed pull (backoff and retry). During a deploy, a new client can briefly reach an old server that ignores `cursor` and returns history from the start; applying that page would move the cursor backwards. The deploy workflow also deploys the web app only after the API.
- The loop also stops when a page leaves the cursor unchanged (an empty page that still claims `has_more`).
- Every pulled entry is applied in server order, including this device's own. Skipping any entry can make devices diverge: panel updates carry only the changed fields, so a skipped entry can drop another device's change to a different field. The cost is a brief flicker: a re-pulled older own edit can overwrite a newer pending local edit until that edit is pushed and pulled back.
- The stale-cursor workaround in `pull()` stays for now. Removing it is a follow-up once the fix has been in use for a while.

## Design: Stage 2, Second-Device Merge

### Reconcile paths

`reconcileAfterAuth` keeps its early returns (no local user, or local id equals server id). Otherwise it downloads the account's full history once, using stage 1 paging, and picks the path from it. This replaces the two-step check (local data first, then a server probe) added in PR #8.

- **Account history is empty: adopt.** This is the current `reconcileFirstDevice`: remap the user id and queue creates for the seeded rows.
- **Account history is not empty: merge.**

The wipe path (`reconcileSecondDevice`) and the `hasUserCreatedData` check are removed. A seed-only device is a merge in which nothing is kept.

**Switching accounts.** Signing out only clears the token, so a device can still hold another account's data. Once a device has signed in, its local user no longer has the seed email (`local@pancakemaker.app`), so a different email means the device belonged to another account. In that case:

- If the device has unsynced changes, sign-in is refused with a message to sign in to the previous account first, so the changes sync rather than being lost. This check runs before any network call.
- Otherwise the device downloads the new account's history, then resets to a fresh seed in one transaction (the previous account's data is safe on its server), and continues as a fresh device: adopt if the new account is empty, merge otherwise. Nothing from the previous account reaches the new one.

**Showing the right route.** The app lists routes by type, then age (`created_at`, `id`), so when an account already has duplicate routes of a type, the app shows the oldest one, which is the one the merge maps device rows to.

### Ordered sync log ids

Entries from one push share a `server_timestamp`, and their ids are random UUIDs. A pull page boundary that falls inside such a batch can put an expense on an earlier page than the category it references, and the expense then fails its foreign key check on the pulling device and is skipped for good. The merge pushes large dependent batches, and ordinary use hits this too on accounts with more than 1000 entries. Sync log ids therefore sort in creation order: `<13-digit ms timestamp>-<6-digit sequence>-<uuid>`, never decreasing even if the clock moves back. Parents are logged before their children, so they sort first.

### Shared apply

`applyRemoteEntry` moves out of `sync-engine.ts` into its own module, so reconcile and the sync engine apply entries the same way.

### Merge steps

The download happens first and writes nothing. Everything after it runs in one `db.transaction`. SQLite ignores `PRAGMA foreign_keys` inside a transaction, so every statement keeps foreign keys valid by ordering: insert the server user row before moving children to it, repoint references before deleting a row.

1. Move the device to the server user: insert the server user row (after renaming the old row's email to its id, in case the emails collide), move routes, tags and `sync_log` rows to it, then delete the old user row.
2. Apply the downloaded entries to the local DB. The device's rows and the account's rows now sit side by side.
3. Build an id map from device rows to account rows.
   - **Routes:** by `type`.
   - **Categories:** within the mapped route, by name compared trimmed and case-insensitively.
   - **Panels:** within the mapped route, by name (trimmed, case-insensitive) and `recurrence_type`.
   - **Tags:** by name, trimmed and case-insensitive.
4. For each matched device row, repoint its references (`expenses.panel_id`, `expenses.category_id`, `recurring_templates.panel_id`, `recurring_templates.category_id`, `expense_tags.tag_id`) to the account row, then delete the device row. Matching takes precedence over local edits: the account's version of a matched row wins, even if the device edited it.
5. For each unmatched device category or panel:
   - **Keep it** if it is in use (referenced by any device expense, including soft-deleted ones, or a recurring template) or user-touched (it has a pending `sync_log` entry). Kept rows are re-parented to the mapped account route. Kept panels get `is_default = 0`.
   - **Delete it** otherwise. It is an untouched seed row the account doesn't have.
   - Unmatched device tags are always kept: seeding creates no tags, so every device tag was made by the user.
   - Rows under a device route that was kept (the account has no route of that type) are all kept.
6. Keep every device expense, including soft-deleted ones. Generated recurring copies reference their source through `source_expense_id`, so dropping a soft-deleted source would break its live copies on other devices.
7. Replace all pending `sync_log` entries with `create` entries for every kept device row, in dependency order: routes (only when the account lacked that type), categories, panels, tags, then all device expenses by `created_at`. Pending deletes are dropped, so a delete made before sign-in never reaches the account.
8. Store the cursor of the download's last entry as the sync cursor.

If the account has no route of some type, the device's route of that type is kept and pushed instead of matched.

### Errors

- **Download fails:** reconcile throws before writing anything. The sign-in views already clear the token and ask the user to sign in again.
- **Merge fails:** the transaction rolls back and reconcile throws, which is handled the same way.

## Out of Scope

- **Syncing `expense_tags`.** The links between expenses and tags are not synced today. The merge keeps local links consistent but does not start syncing them.
- **Removing the stale-cursor workaround.** That is a follow-up after stage 1 has been in use.
- **Index for paging.** Each pull page scans every `sync_log` row for the user. A D1 index on `(user_id, server_timestamp, id)` would make paging a range scan. That needs a D1 migration, which stage 1 avoids.

## Testing

### Stage 1

- **Server:**
  - Paging across a boundary inside a batch of entries that share a `server_timestamp` returns every entry exactly once.
  - A bare-timestamp cursor starts at that timestamp.
  - `since` behaves as before.
- **Sync engine:**
  - A push does not move the cursor.
  - `has_more` triggers another page from the last applied entry.
  - A change another device pushed before this device's push still arrives, with and without a stored cursor.
  - A first sign-in with no expenses keeps the data it just pushed, and a device with no expenses keeps data it pushed on an earlier cycle (both go through the stale-cursor workaround).
  - Concurrent edits to one record converge to the server's last write.
  - Re-applying a `create` over a row that expenses reference keeps those expenses.
  - A page that starts at or before the cursor is not applied.
  - A page that leaves the cursor unchanged ends the pull.
  - A failed page leaves the cursor at the last applied page.

### Stage 2

- **Reconcile,** one test per rule:
  - route matched by type;
  - category matched by name, case-insensitively;
  - panel matched by name and recurrence type;
  - tag matched by name;
  - unmatched in-use row kept and pushed;
  - untouched unmatched seed row deleted;
  - kept panel loses `is_default`;
  - pre-sign-in delete not queued;
  - soft-deleted device expense queued;
  - seed-only device ends identical to the account;
  - download failure leaves the local DB untouched.
- **Two-device simulation:** both devices end with the same routes, categories and panels, and every expense from either device applies on the other.
