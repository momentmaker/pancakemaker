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

- New optional `cursor` query parameter: `<server_timestamp>|<id>`. Clients treat it as opaque.
- With `cursor`: return entries where `(server_timestamp, id)` is strictly greater than the cursor, ordered by `server_timestamp, id`, limited to 1000.
- Response adds `next_cursor`: the cursor for the last entry returned, or `null` when no entries are returned. The client keeps its current cursor when `next_cursor` is `null`.
- `since` keeps its current behavior, so clients that haven't updated still work.

### Client: `api-client.ts`

- `pullEntries` takes the stored cursor and sends it as `cursor`.
- A stored cursor without an id part (a bare timestamp written by older clients) is sent as `(timestamp, '')`. The empty id sorts before every real id, so the next pull starts exactly where the old cursor pointed.

### Client: `sync-engine.ts`

- `push()` no longer writes the cursor.
- `pull()` loops: fetch a page, apply it, store `next_cursor`, and repeat while `has_more` is true. The cursor advances only after a page is applied, so an interrupted pull resumes instead of skipping.
- Entries whose `id` exists in the local `sync_log` are this device's own pushes and are skipped rather than re-applied. This keeps a re-pulled older edit from overwriting a newer local one.
- The stale-cursor workaround in `pull()` stays for now. Removing it is a follow-up once the fix has been in use for a while.

## Design: Stage 2, Second-Device Merge

### Reconcile paths

`reconcileAfterAuth` keeps its early returns (no local user, or local id equals server id). Otherwise it downloads the account's full history using stage 1 paging.

- **Account history is empty: adopt.** This is the current `reconcileFirstDevice`: remap the user id and queue creates for the seeded rows.
- **Account history is not empty: merge.**

The wipe path (`reconcileSecondDevice`) and the `hasUserCreatedData` check are removed. A seed-only device is a merge in which nothing is kept.

### Shared apply

`applyRemoteEntry` moves out of `sync-engine.ts` into its own module, so reconcile and the sync engine apply entries the same way.

### Merge steps

The download happens first and writes nothing. Everything after it runs in one `db.transaction`.

1. Remap the local user id to the server user id.
2. Apply the downloaded entries to the local DB. The device's rows and the account's rows now sit side by side.
3. Build an id map from device rows to account rows.
   - **Routes:** by `type`.
   - **Categories:** within the mapped route, by name compared trimmed and case-insensitively.
   - **Panels:** within the mapped route, by name (trimmed, case-insensitive) and `recurrence_type`.
   - **Tags:** by name, trimmed and case-insensitive.
4. For each matched device row, repoint its references (`expenses.panel_id`, `expenses.category_id`, `recurring_templates.panel_id`, `recurring_templates.category_id`, `expense_tags.tag_id`) to the account row, then delete the device row. Matching takes precedence over local edits: the account's version of a matched row wins, even if the device edited it.
5. For each unmatched device row:
   - **Keep it** if it is in use (referenced by a live expense or a recurring template) or user-touched (it has a pending `sync_log` entry). Kept rows are re-parented to the mapped account route. Kept panels get `is_default = 0`.
   - **Delete it** otherwise. It is an untouched seed row the account doesn't have.
6. Drop soft-deleted device expenses (they were never synced).
7. Replace all pending `sync_log` entries with `create` entries for every kept device row: routes (only when the account lacked that type), categories, panels, tags and live expenses. Pending deletes are dropped, so a delete made before sign-in never reaches the account.
8. Store the download's final `next_cursor` as the sync cursor.

If the account has no route of some type, the device's route of that type is kept and pushed instead of matched.

### Errors

- **Download fails:** reconcile throws before writing anything. The sign-in views already clear the token and ask the user to sign in again.
- **Merge fails:** the transaction rolls back and reconcile throws, which is handled the same way.

## Out of Scope

- **Syncing `expense_tags`.** The links between expenses and tags are not synced today. The merge keeps local links consistent but does not start syncing them.
- **Removing the stale-cursor workaround.** That is a follow-up after stage 1 has been in use.

## Testing

### Stage 1

- **Server:**
  - Paging across a boundary inside a batch of entries that share a `server_timestamp` returns every entry exactly once.
  - `since` behaves as before.
- **Sync engine:**
  - A push does not move the cursor.
  - `has_more` triggers another page from `next_cursor`.
  - The device's own entries are not re-applied.
  - A change another device pushed before this device's push still arrives.
  - A bare-timestamp cursor from an older client continues without gaps.

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
  - soft-deleted expense dropped;
  - seed-only device ends identical to the account;
  - download failure leaves the local DB untouched.
- **Two-device simulation:** both devices end with the same routes, categories and panels, and every expense from either device applies on the other.
