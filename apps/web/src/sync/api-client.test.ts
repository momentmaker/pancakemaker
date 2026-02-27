import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getStoredToken,
  storeToken,
  clearToken,
  getStoredSyncCursor,
  storeSyncCursor,
  pushEntries,
  pullEntries,
  requestMagicLink,
  verifyToken,
  getStoredUserEmail,
  storeUserEmail,
} from './api-client.js'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('token storage', () => {
  it('stores and retrieves a token', () => {
    // #given / #when
    storeToken('my-jwt')

    // #then
    expect(getStoredToken()).toBe('my-jwt')
  })

  it('returns null when no token stored', () => {
    expect(getStoredToken()).toBeNull()
  })

  it('clears a stored token', () => {
    // #given
    storeToken('my-jwt')

    // #when
    clearToken()

    // #then
    expect(getStoredToken()).toBeNull()
  })
})

describe('sync cursor storage', () => {
  it('stores and retrieves sync cursor', () => {
    // #given / #when
    storeSyncCursor('2026-02-26T00:00:00.000Z')

    // #then
    expect(getStoredSyncCursor()).toBe('2026-02-26T00:00:00.000Z')
  })

  it('returns null when no cursor stored', () => {
    expect(getStoredSyncCursor()).toBeNull()
  })
})

describe('pushEntries', () => {
  it('returns error when not authenticated', async () => {
    // #given - no token stored

    // #when
    const result = await pushEntries([])

    // #then
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Not authenticated')
    }
  })

  it('sends entries with auth header', async () => {
    // #given
    storeToken('test-jwt')
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, synced: 1, server_timestamp: '2026-02-26T00:00:00.000Z' }),
          { status: 200 },
        ),
      )

    // #when
    const result = await pushEntries([
      {
        id: 'entry-1',
        table_name: 'expenses',
        record_id: 'exp-1',
        action: 'create',
        payload: '{}',
        local_timestamp: '2026-02-26T00:00:00.000Z',
      },
    ])

    // #then
    expect(result.success).toBe(true)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toContain('/sync/push')
    expect((init as RequestInit).headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer test-jwt' }),
    )
  })

  it('handles network error gracefully', async () => {
    // #given
    storeToken('test-jwt')
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network failed'))

    // #when
    const result = await pushEntries([])

    // #then
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Network error')
    }
  })

  it('handles HTTP error response', async () => {
    // #given
    storeToken('test-jwt')
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 }),
    )

    // #when
    const result = await pushEntries([])

    // #then
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Bad request')
    }
  })
})

describe('pullEntries', () => {
  it('returns error when not authenticated', async () => {
    // #given - no token

    // #when
    const result = await pullEntries()

    // #then
    expect(result.success).toBe(false)
  })

  it('fetches entries with since parameter', async () => {
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
    const result = await pullEntries('2026-02-26T00:00:00.000Z')

    // #then
    expect(result.success).toBe(true)
    const [url] = fetchSpy.mock.calls[0]
    expect(url).toContain('since=2026-02-26T00%3A00%3A00.000Z')
  })

  it('fetches without since parameter when null', async () => {
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
    expect(url).not.toContain('since=')
  })
})

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
    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toContain('/auth/verify')
    expect(opts).toMatchObject({ method: 'POST' })
    expect(JSON.parse(opts.body as string)).toEqual({ token: 'magic-token' })
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
