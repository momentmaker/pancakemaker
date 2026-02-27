# Auth Flow Design: Opt-in Cloud Sync

## Problem

The sync infrastructure (API endpoints, sync engine, D1 database) is complete but the frontend auth UI is not wired up. Users cannot log in, verify magic links, or manage their account. Sync is non-functional in production.

## Approach

Auth is opt-in. The app works fully offline with a local user. If users want cloud sync across devices, they log in via magic link email. No route guards — the entire app is always accessible regardless of auth state.

## Design

### New SyncStatus: "local"

Add `'local'` to `SyncStatus`. When online but no JWT token is stored, the sync engine returns `'local'` instead of `'synced'`. This distinguishes "synced to cloud" from "working locally without sync."

### Login.tsx — Wire up form

Add state for email, loading, success, error. On submit, POST to `/auth/magic-link`. On success, show "Check your email" message. On error, show inline error.

### AuthVerify.tsx — Magic link callback (new file)

New route at `/auth/verify`. On mount, reads `token` from query params, calls `GET /auth/verify?token=...`. On success: stores JWT, stores user email, triggers immediate sync (pushes local data), redirects to `/settings`. On error: shows message with link back to login.

### api-client.ts — Auth helpers

New public functions (no auth header required):

- `requestMagicLink(email)` — POST `/auth/magic-link`
- `verifyToken(token)` — GET `/auth/verify?token=...`
- `storeUserEmail(email)` / `getStoredUserEmail()` — localStorage helpers

### SyncIndicator — Clickable with popover

Wrap indicator in a button. On click, show popover:

- Not logged in: "Local only" + "Enable cloud sync" link to `/auth/login`
- Logged in: email + status + "Sync now" + "Sign out"
- Offline: "No connection"

### Settings.tsx — Cloud Sync card

Replace "Sync Status" card:

- Not logged in: "Sync your data across devices" + "Sign in" button
- Logged in: email display, sync status, "Sync now", "Sign out"

### Resend from address

Change from `noreply@pancakemaker.app` to `noreply@pancakemaker.com`.

## Files

| File                                        | Change                                   |
| ------------------------------------------- | ---------------------------------------- |
| `apps/web/src/sync/api-client.ts`           | Add auth helpers and email storage       |
| `apps/web/src/sync/api-client.test.ts`      | Tests for new functions                  |
| `apps/web/src/sync/sync-engine.ts`          | Add `'local'` status                     |
| `apps/web/src/sync/SyncContext.tsx`         | Export updated type                      |
| `apps/web/src/views/Login.tsx`              | Wire up form                             |
| `apps/web/src/views/AuthVerify.tsx`         | New — magic link callback                |
| `apps/web/src/views/Settings.tsx`           | Replace Sync Status with Cloud Sync card |
| `apps/web/src/components/SyncIndicator.tsx` | Add `'local'` status, clickable popover  |
| `apps/web/src/App.tsx`                      | Add `/auth/verify` route                 |
| `workers/api/src/lib/resend.ts`             | Fix from address                         |

## Testing

- `api-client.test.ts` — tests for `requestMagicLink` and `verifyToken`
- Manual browser verification for login flow end-to-end
