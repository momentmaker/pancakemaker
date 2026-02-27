# Auth Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the opt-in auth flow so users can log in via magic link and sync data to the cloud.

**Architecture:** Wire up existing API endpoints and sync infrastructure. No new abstractions — add `requestMagicLink` and `verifyToken` to api-client.ts, add a `'local'` sync status, wire up Login.tsx, create AuthVerify.tsx callback, and update Settings/SyncIndicator UI.

**Tech Stack:** React 19, React Router, Vite, Vitest, Tailwind CSS v4, Cloudflare Workers (Hono), Resend

---

### Task 1: Add auth helpers to api-client.ts

**Files:**

- Modify: `apps/web/src/sync/api-client.ts`
- Test: `apps/web/src/sync/api-client.test.ts`

**Step 1: Write failing tests for requestMagicLink and verifyToken**

Add to `apps/web/src/sync/api-client.test.ts`:

```typescript
// Add requestMagicLink, verifyToken, getStoredUserEmail, storeUserEmail to the import at line 2-10

describe('requestMagicLink', () => {
  it('sends email to magic-link endpoint', async () => {
    // #given
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    // #when
    const result = await requestMagicLink('test@example.com')

    // #then
    expect(result.success).toBe(true)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toContain('/auth/magic-link')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      email: 'test@example.com',
    })
  })

  it('returns error on failure', async () => {
    // #given
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Valid email is required' }), { status: 400 }),
    )

    // #when
    const result = await requestMagicLink('bad')

    // #then
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Valid email is required')
    }
  })

  it('handles network error', async () => {
    // #given
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network failed'))

    // #when
    const result = await requestMagicLink('test@example.com')

    // #then
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Network error')
    }
  })
})

describe('verifyToken', () => {
  it('verifies token and returns jwt and user', async () => {
    // #given
    const payload = {
      token: 'jwt-string',
      user: { id: 'u1', email: 'test@example.com', baseCurrency: 'USD' },
    }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))

    // #when
    const result = await verifyToken('magic-token')

    // #then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.token).toBe('jwt-string')
      expect(result.data.user.email).toBe('test@example.com')
    }
    const [url] = fetchSpy.mock.calls[0]
    expect(url).toContain('/auth/verify?token=magic-token')
  })

  it('returns error for invalid token', async () => {
    // #given
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 }),
    )

    // #when
    const result = await verifyToken('bad-token')

    // #then
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Invalid token')
    }
  })
})

describe('user email storage', () => {
  it('stores and retrieves user email', () => {
    // #given / #when
    storeUserEmail('test@example.com')

    // #then
    expect(getStoredUserEmail()).toBe('test@example.com')
  })

  it('returns null when no email stored', () => {
    expect(getStoredUserEmail()).toBeNull()
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -w @pancakemaker/web -- --run`
Expected: FAIL — `requestMagicLink`, `verifyToken`, `storeUserEmail`, `getStoredUserEmail` are not exported

**Step 3: Implement the auth helpers**

In `apps/web/src/sync/api-client.ts`:

Add after line 14 (after `clearToken`):

```typescript
const USER_EMAIL_KEY = 'pancakemaker_user_email'

export function getStoredUserEmail(): string | null {
  return localStorage.getItem(USER_EMAIL_KEY)
}

export function storeUserEmail(email: string): void {
  localStorage.setItem(USER_EMAIL_KEY, email)
}

export function clearUserEmail(): void {
  localStorage.removeItem(USER_EMAIL_KEY)
}
```

Add after `pullEntries` at the end of file (these are unauthenticated API calls so they don't use `apiRequest`):

```typescript
interface VerifyResult {
  token: string
  user: { id: string; email: string; baseCurrency: string }
}

export async function requestMagicLink(email: string): Promise<ApiResult<{ ok: true }>> {
  try {
    const res = await fetch(`${getApiUrl()}/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { success: false, error: (body as { error?: string }).error ?? `HTTP ${res.status}` }
    }

    const data = (await res.json()) as { ok: true }
    return { success: true, data }
  } catch {
    return { success: false, error: 'Network error' }
  }
}

export async function verifyToken(token: string): Promise<ApiResult<VerifyResult>> {
  try {
    const res = await fetch(`${getApiUrl()}/auth/verify?token=${encodeURIComponent(token)}`)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { success: false, error: (body as { error?: string }).error ?? `HTTP ${res.status}` }
    }

    const data = (await res.json()) as VerifyResult
    return { success: true, data }
  } catch {
    return { success: false, error: 'Network error' }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -w @pancakemaker/web -- --run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add apps/web/src/sync/api-client.ts apps/web/src/sync/api-client.test.ts
git commit -m "feat: add auth helpers to api-client (requestMagicLink, verifyToken, email storage)"
```

---

### Task 2: Add 'local' sync status

**Files:**

- Modify: `apps/web/src/sync/sync-engine.ts`
- Modify: `apps/web/src/sync/SyncContext.tsx`

**Step 1: Update SyncStatus type in sync-engine.ts**

In `apps/web/src/sync/sync-engine.ts`:

Change line 12:

```typescript
// old
export type SyncStatus = 'synced' | 'pending' | 'offline'
// new
export type SyncStatus = 'synced' | 'pending' | 'offline' | 'local'
```

Change line 25 — initial status should be `'local'` when no token:

```typescript
// old
let status: SyncStatus = navigator.onLine ? 'synced' : 'offline'
// new
let status: SyncStatus = !navigator.onLine ? 'offline' : getStoredToken() ? 'synced' : 'local'
```

Change line 116-118 — in the `sync()` function, return `'local'` when no token:

```typescript
// old
if (!navigator.onLine || !getStoredToken()) {
  setStatus(navigator.onLine ? 'synced' : 'offline')
  return
}
// new
if (!navigator.onLine) {
  setStatus('offline')
  return
}
if (!getStoredToken()) {
  setStatus('local')
  return
}
```

**Step 2: Update SyncContext.tsx initial state**

In `apps/web/src/sync/SyncContext.tsx` line 23:

```typescript
// old
const [status, setStatus] = useState<SyncStatus>(navigator.onLine ? 'synced' : 'offline')
// new
const [status, setStatus] = useState<SyncStatus>(!navigator.onLine ? 'offline' : 'local')
```

The engine will correct this on start if a token exists.

**Step 3: Run build to check for type errors**

Run: `npm run build`
Expected: Type errors in `SyncIndicator.tsx` and `Settings.tsx` because `'local'` is not handled in their switch/config. That's fine — we fix those in Tasks 5 and 6.

If build fails only on those components, proceed. If it fails elsewhere, investigate.

**Step 4: Run tests**

Run: `npm run test -w @pancakemaker/web -- --run`
Expected: PASS (existing tests don't assert on the specific status values affected)

**Step 5: Commit**

```bash
git add apps/web/src/sync/sync-engine.ts apps/web/src/sync/SyncContext.tsx
git commit -m "feat: add 'local' sync status for unauthenticated users"
```

---

### Task 3: Wire up Login.tsx

**Files:**

- Modify: `apps/web/src/views/Login.tsx`

**Step 1: Implement the login form with state and API call**

Replace the full contents of `apps/web/src/views/Login.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { requestMagicLink } from '../sync/api-client'

export function Login() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await requestMagicLink(email.trim())

    setLoading(false)
    if (result.success) {
      setSent(true)
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <div className="w-full max-w-sm rounded-lg border border-border-dim bg-bg-card p-8">
        <h1 className="text-center font-mono text-2xl font-bold text-neon-cyan">pancakemaker</h1>

        {sent ? (
          <div className="mt-6 text-center">
            <p className="text-sm text-text-primary">Check your email</p>
            <p className="mt-2 text-xs text-text-muted">
              We sent a magic link to <span className="text-text-primary">{email}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                setSent(false)
                setEmail('')
              }}
              className="mt-4 text-xs text-neon-cyan hover:underline"
            >
              Try a different email
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-center text-sm text-text-secondary">
              Enter your email for a magic link
            </p>
            <form className="mt-6" onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-border-dim bg-bg-secondary px-4 py-2.5 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-neon-cyan focus:outline-none"
              />
              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="mt-4 w-full rounded-md bg-neon-cyan px-4 py-2.5 text-sm font-semibold text-bg-primary transition-colors hover:bg-neon-cyan/80 disabled:opacity-40"
              >
                {loading ? 'Sending...' : 'Send Magic Link'}
              </button>
            </form>
          </>
        )}

        <div className="mt-6 text-center">
          <Link to="/" className="text-xs text-text-muted hover:text-text-secondary">
            Continue without sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Run build**

Run: `npm run build`
Expected: Compiles (may warn about SyncIndicator/Settings not handling `'local'` — that's expected, fixed later)

**Step 3: Commit**

```bash
git add apps/web/src/views/Login.tsx
git commit -m "feat: wire up Login.tsx with magic link form submission"
```

---

### Task 4: Create AuthVerify.tsx and add route

**Files:**

- Create: `apps/web/src/views/AuthVerify.tsx`
- Modify: `apps/web/src/App.tsx`

**Step 1: Create the verify callback component**

Create `apps/web/src/views/AuthVerify.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { verifyToken, storeToken, storeUserEmail } from '../sync/api-client'
import { useSync } from '../sync/SyncContext'

export function AuthVerify() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { triggerSync } = useSync()
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(true)

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setError('No token provided')
      setVerifying(false)
      return
    }

    verifyToken(token).then((result) => {
      if (result.success) {
        storeToken(result.data.token)
        storeUserEmail(result.data.user.email)
        triggerSync()
        navigate('/settings', { replace: true })
      } else {
        setError(result.error)
        setVerifying(false)
      }
    })
  }, [searchParams, navigate, triggerSync])

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <div className="w-full max-w-sm rounded-lg border border-border-dim bg-bg-card p-8 text-center">
        <h1 className="font-mono text-2xl font-bold text-neon-cyan">pancakemaker</h1>

        {verifying && !error && (
          <p className="mt-6 text-sm text-text-secondary">Verifying your magic link...</p>
        )}

        {error && (
          <div className="mt-6">
            <p className="text-sm text-red-400">{error}</p>
            <Link
              to="/auth/login"
              className="mt-4 inline-block text-xs text-neon-cyan hover:underline"
            >
              Try signing in again
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Add `/auth/verify` route to App.tsx**

In `apps/web/src/App.tsx`:

Add import:

```typescript
import { AuthVerify } from './views/AuthVerify'
```

Add route after line 37 (the `/auth/login` route). Note: `/auth/verify` needs to be inside the Layout route so `useSync` context is available:

```tsx
<Route path="/auth/verify" element={<AuthVerify />} />
```

Wait — `AuthVerify` uses `useSync()` which requires `<SyncProvider>`. Looking at the app, `SyncProvider` wraps the entire app in `main.tsx`, so it's available at all routes. The `/auth/login` route is outside `<Layout />` but still inside `<SyncProvider>`. So place `/auth/verify` next to `/auth/login`:

```tsx
<Route path="/auth/login" element={<Login />} />
<Route path="/auth/verify" element={<AuthVerify />} />
```

**Step 3: Run build**

Run: `npm run build`
Expected: Compiles

**Step 4: Commit**

```bash
git add apps/web/src/views/AuthVerify.tsx apps/web/src/App.tsx
git commit -m "feat: add AuthVerify callback for magic link authentication"
```

---

### Task 5: Update SyncIndicator with 'local' status and clickable popover

**Files:**

- Modify: `apps/web/src/components/SyncIndicator.tsx`

**Step 1: Rewrite SyncIndicator with popover**

Replace full contents of `apps/web/src/components/SyncIndicator.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { SyncStatus } from '../sync/sync-engine'
import { getStoredUserEmail, clearToken, clearUserEmail } from '../sync/api-client'
import { useSync } from '../sync/SyncContext'

const statusConfig: Record<SyncStatus, { color: string; label: string; pulse: boolean }> = {
  synced: { color: 'var(--color-sync-synced)', label: 'Synced', pulse: false },
  pending: { color: 'var(--color-sync-pending)', label: 'Syncing', pulse: true },
  offline: { color: 'var(--color-sync-offline)', label: 'Offline', pulse: false },
  local: { color: 'var(--color-text-muted)', label: 'Local', pulse: false },
}

export function SyncIndicator({ status }: { status: SyncStatus }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { triggerSync } = useSync()
  const config = statusConfig[status]
  const email = getStoredUserEmail()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleSignOut(): void {
    clearToken()
    clearUserEmail()
    setOpen(false)
    window.location.reload()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-bg-card"
      >
        <span className="relative flex h-2 w-2">
          {config.pulse && (
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ backgroundColor: config.color }}
            />
          )}
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{
              backgroundColor: config.color,
              boxShadow: `0 0 6px ${config.color}`,
            }}
          />
        </span>
        <span style={{ color: config.color }}>{config.label}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-border-dim bg-bg-card p-3 shadow-lg">
          {status === 'local' && (
            <>
              <p className="text-xs text-text-muted">Data stays on this device.</p>
              <Link
                to="/auth/login"
                onClick={() => setOpen(false)}
                className="mt-2 inline-block text-xs text-neon-cyan hover:underline"
              >
                Enable cloud sync
              </Link>
            </>
          )}

          {status === 'offline' && (
            <p className="text-xs text-text-muted">No network connection.</p>
          )}

          {(status === 'synced' || status === 'pending') && (
            <>
              {email && <p className="truncate text-xs text-text-secondary">{email}</p>}
              <p className="mt-1 text-xs text-text-muted">
                {status === 'synced' ? 'All changes synced.' : 'Syncing changes...'}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    triggerSync()
                    setOpen(false)
                  }}
                  className="text-xs text-neon-cyan hover:underline"
                >
                  Sync now
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-xs text-text-muted hover:text-red-400"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Run build**

Run: `npm run build`
Expected: May fail if `clearUserEmail` isn't exported yet. If so, ensure Task 1 exported it. Otherwise, compiles.

**Step 3: Run tests**

Run: `npm run test -w @pancakemaker/web -- --run`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/SyncIndicator.tsx
git commit -m "feat: make SyncIndicator clickable with popover for auth and sync controls"
```

---

### Task 6: Update Settings.tsx Cloud Sync card

**Files:**

- Modify: `apps/web/src/views/Settings.tsx`

**Step 1: Replace the Sync Status card with Cloud Sync card**

In `apps/web/src/views/Settings.tsx`:

Add imports at top:

```typescript
import { useNavigate } from 'react-router-dom'
import { getStoredUserEmail, clearToken, clearUserEmail } from '../sync/api-client'
```

Add inside the `Settings` function body (after existing state declarations):

```typescript
const navigate = useNavigate()
const userEmail = getStoredUserEmail()

const handleSignOut = useCallback(() => {
  clearToken()
  clearUserEmail()
  window.location.reload()
}, [])
```

Replace the Sync Status card (lines 174-192) with:

```tsx
{
  /* Cloud Sync */
}
;<Card className="mt-4">
  <div className="flex items-center justify-between">
    <h2 className="font-mono text-sm font-semibold text-text-secondary">Cloud Sync</h2>
    <SyncIndicator status={syncStatus} />
  </div>

  {userEmail ? (
    <div className="mt-2">
      <p className="text-xs text-text-muted">
        Signed in as <span className="text-text-primary">{userEmail}</span>
      </p>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {syncStatus === 'offline'
            ? 'No network connection.'
            : syncStatus === 'pending'
              ? 'Syncing changes...'
              : 'All changes synced.'}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={triggerSync} disabled={syncStatus === 'offline'}>
            Sync now
          </Button>
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className="text-red-400 hover:text-red-300"
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  ) : (
    <div className="mt-2">
      <p className="text-xs text-text-muted">
        Sync your data across devices. Your data stays on this device until you sign in.
      </p>
      <div className="mt-3">
        <Button variant="secondary" onClick={() => navigate('/auth/login')}>
          Sign in with email
        </Button>
      </div>
    </div>
  )}
</Card>
```

**Step 2: Run build**

Run: `npm run build`
Expected: Compiles

**Step 3: Run tests**

Run: `npm run test -w @pancakemaker/web -- --run`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/views/Settings.tsx
git commit -m "feat: replace Sync Status card with Cloud Sync card showing auth state"
```

---

### Task 7: Fix Resend from address

**Files:**

- Modify: `workers/api/src/lib/resend.ts`

**Step 1: Change from address**

In `workers/api/src/lib/resend.ts` line 16:

```typescript
// old
from: 'Pancakemaker <noreply@pancakemaker.app>',
// new
from: 'pancakemaker <noreply@pancakemaker.com>',
```

**Step 2: Run build**

Run: `npm run build`
Expected: Compiles

**Step 3: Commit**

```bash
git add workers/api/src/lib/resend.ts
git commit -m "fix: use pancakemaker.com for Resend from address"
```

---

### Task 8: Final verification

**Step 1: Run full build**

Run: `npm run build`
Expected: Clean build, no errors

**Step 2: Run all tests**

Run: `npm run test`
Expected: ALL PASS (including new api-client tests)

**Step 3: Run format check**

Run: `npx prettier --check .`
Expected: All files formatted. If any fail, run `npm run format` and commit.

**Step 4: Manual browser verification checklist**

1. Visit `/` — app loads normally, SyncIndicator shows "Local" with muted color
2. Click SyncIndicator — popover shows "Data stays on this device" + "Enable cloud sync" link
3. Go to Settings — Cloud Sync card shows "Sign in with email" button
4. Click sign in — navigates to `/auth/login`
5. Enter email, click "Send Magic Link" — shows "Check your email" or error
6. Visit `/auth/verify?token=invalid` — shows error with "Try signing in again" link
7. "Continue without sign in" link on login page goes back to `/`
