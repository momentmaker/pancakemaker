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

export function getStoredSyncCursor(): string | null {
  return localStorage.getItem(SYNC_CURSOR_KEY)
}

export function storeSyncCursor(timestamp: string): void {
  localStorage.setItem(SYNC_CURSOR_KEY, timestamp)
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

const API_URL = 'http://localhost:8787'

function getApiUrl(): string {
  return API_URL
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResult<T>> {
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

export async function pushEntries(
  entries: SyncPushEntry[],
): Promise<ApiResult<PushResult>> {
  return apiRequest<PushResult>('/sync/push', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  })
}

export async function pullEntries(
  since?: string | null,
): Promise<ApiResult<PullResult>> {
  const params = since ? `?since=${encodeURIComponent(since)}` : ''
  return apiRequest<PullResult>(`/sync/pull${params}`)
}
