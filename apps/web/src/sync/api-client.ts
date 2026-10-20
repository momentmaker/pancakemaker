const TOKEN_KEY = 'pancakemaker_jwt'
const SYNC_CURSOR_KEY = 'pancakemaker_last_sync'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

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

export function getStoredSyncCursor(): string | null {
  return localStorage.getItem(SYNC_CURSOR_KEY)
}

export function storeSyncCursor(timestamp: string): void {
  localStorage.setItem(SYNC_CURSOR_KEY, timestamp)
}

export function clearSyncCursor(): void {
  localStorage.removeItem(SYNC_CURSOR_KEY)
}

export interface SyncPushEntry {
  id: string
  table_name: string
  record_id: string
  action: string
  payload: string
  local_timestamp: string
}

export interface SyncPullEntry {
  id: string
  table_name: string
  record_id: string
  action: string
  payload: string
  local_timestamp: string
  server_timestamp: string
}

interface PushResult {
  ok: true
  synced: number
  server_timestamp: string
}

interface PullResult {
  entries: SyncPullEntry[]
  server_timestamp: string
  has_more: boolean
}

type ApiResult<T> = { success: true; data: T } | { success: false; error: string }

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

function getApiUrl(): string {
  return API_URL
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const token = getStoredToken()
  if (!token) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    const res = await fetch(`${getApiUrl()}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return {
        success: false,
        error: (body as { error?: string }).error ?? `HTTP ${res.status}`,
      }
    }

    const data = (await res.json()) as T
    return { success: true, data }
  } catch {
    return { success: false, error: 'Network error' }
  }
}

export async function pushEntries(entries: SyncPushEntry[]): Promise<ApiResult<PushResult>> {
  return apiRequest<PushResult>('/sync/push', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  })
}

export function cursorAfter(entry: Pick<SyncPullEntry, 'server_timestamp' | 'id'>): string {
  return `${entry.server_timestamp}|${entry.id}`
}

export function isAfterCursor(
  entry: Pick<SyncPullEntry, 'server_timestamp' | 'id'>,
  cursor: string | null,
): boolean {
  if (!cursor) return true
  const separator = cursor.lastIndexOf('|')
  const timestamp = separator === -1 ? cursor : cursor.slice(0, separator)
  const id = separator === -1 ? '' : cursor.slice(separator + 1)
  return (
    entry.server_timestamp > timestamp || (entry.server_timestamp === timestamp && entry.id > id)
  )
}

export async function pullEntries(cursor?: string | null): Promise<ApiResult<PullResult>> {
  const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return apiRequest<PullResult>(`/sync/pull${params}`)
}

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

export async function verifyCode(email: string, code: string): Promise<ApiResult<VerifyResult>> {
  try {
    const res = await fetch(`${getApiUrl()}/auth/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    })

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

export async function verifyToken(token: string): Promise<ApiResult<VerifyResult>> {
  try {
    const res = await fetch(`${getApiUrl()}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })

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
