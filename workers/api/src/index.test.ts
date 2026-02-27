import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sign } from 'hono/jwt'
import app from './index.js'

const JWT_SECRET = 'test-secret-key-for-testing'

function createMockStatement(returnValue: unknown = null) {
  const stmt: Record<string, unknown> = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true }),
    first: vi.fn().mockResolvedValue(returnValue),
    all: vi.fn().mockResolvedValue({ results: Array.isArray(returnValue) ? returnValue : [] }),
    raw: vi.fn().mockResolvedValue([]),
  }
  return stmt
}

function createMockDb(stmtOverrides?: Record<string, unknown>) {
  const defaultStmt = createMockStatement()
  const merged = { ...defaultStmt, ...stmtOverrides }
  return {
    prepare: vi.fn().mockReturnValue(merged),
    batch: vi.fn().mockResolvedValue([]),
    dump: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock D1 exec signature
    exec: vi.fn().mockResolvedValue({ count: 0 } as any),
  }
}

function env(dbOverrides?: Record<string, unknown>) {
  return {
    DB: createMockDb(dbOverrides),
    RESEND_API_KEY: 'test-resend-key',
    JWT_SECRET,
    APP_URL: 'http://localhost:5173',
    ENVIRONMENT: 'test',
  }
}

async function createTestJwt(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return sign({ sub: userId, iat: now, exp: now + 3600 }, JWT_SECRET)
}

describe('health check', () => {
  it('returns ok', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})

describe('POST /auth/magic-link', () => {
  it('rejects missing email', async () => {
    // #given
    const testEnv = env()

    // #when
    const res = await app.request(
      '/auth/magic-link',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      testEnv,
    )

    // #then
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('email')
  })

  it('rejects invalid email format', async () => {
    // #given
    const testEnv = env()

    // #when
    const res = await app.request(
      '/auth/magic-link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      },
      testEnv,
    )

    // #then
    expect(res.status).toBe(400)
  })

  it('stores token and sends email for valid email', async () => {
    // #given
    const testEnv = env()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'email-id' }), { status: 200 }),
    )

    // #when
    const res = await app.request(
      '/auth/magic-link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      },
      testEnv,
    )

    // #then
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(testEnv.DB.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth_tokens'),
    )
  })
})

describe('POST /auth/verify', () => {
  it('rejects missing token', async () => {
    // #given
    const testEnv = env()

    // #when
    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, testEnv)

    // #then
    expect(res.status).toBe(400)
  })

  it('rejects invalid token', async () => {
    // #given - first returns null (token not found)
    const testEnv = env({ first: vi.fn().mockResolvedValue(null) })

    // #when
    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'invalid-token' }),
    }, testEnv)

    // #then
    expect(res.status).toBe(401)
  })

  it('rejects expired token', async () => {
    // #given
    const testEnv = env({
      first: vi.fn().mockResolvedValue({
        id: 'token-id',
        email: 'test@example.com',
        expires_at: '2020-01-01T00:00:00.000Z',
        used_at: null,
      }),
    })

    // #when
    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'some-token' }),
    }, testEnv)

    // #then
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toContain('expired')
  })

  it('rejects already used token', async () => {
    // #given
    const testEnv = env({
      first: vi.fn().mockResolvedValue({
        id: 'token-id',
        email: 'test@example.com',
        expires_at: new Date(Date.now() + 600000).toISOString(),
        used_at: '2025-01-01T00:00:00.000Z',
      }),
    })

    // #when
    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'used-token' }),
    }, testEnv)

    // #then
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toContain('used')
  })

  it('creates new user and returns JWT for valid token', async () => {
    // #given - first call returns auth_token, second returns null (no existing user)
    const firstFn = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'token-id',
        email: 'new@example.com',
        expires_at: new Date(Date.now() + 600000).toISOString(),
        used_at: null,
      })
      .mockResolvedValueOnce(null)

    const testEnv = env({ first: firstFn })

    // #when
    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'valid-token' }),
    }, testEnv)

    // #then
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBeDefined()
    expect(body.user.email).toBe('new@example.com')
  })

  it('returns JWT for existing user', async () => {
    // #given - first call returns auth_token, second returns existing user
    const firstFn = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'token-id',
        email: 'existing@example.com',
        expires_at: new Date(Date.now() + 600000).toISOString(),
        used_at: null,
      })
      .mockResolvedValueOnce({
        id: 'user-123',
        email: 'existing@example.com',
        base_currency: 'EUR',
      })

    const testEnv = env({ first: firstFn })

    // #when
    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'valid-token' }),
    }, testEnv)

    // #then
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.id).toBe('user-123')
    expect(body.user.baseCurrency).toBe('EUR')
  })
})

describe('GET /currency/rates', () => {
  it('rejects unsupported currency', async () => {
    // #given
    const testEnv = env()

    // #when
    const res = await app.request('/currency/rates?base=XYZ', {}, testEnv)

    // #then
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Unsupported')
  })

  it('returns cached rates when available', async () => {
    // #given
    const testEnv = env({
      all: vi.fn().mockResolvedValue({
        results: [
          { target_currency: 'EUR', rate: 0.85 },
          { target_currency: 'GBP', rate: 0.73 },
        ],
      }),
    })

    // #when
    const res = await app.request('/currency/rates?base=USD', {}, testEnv)

    // #then
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cached).toBe(true)
    expect(body.rates.EUR).toBe(0.85)
    expect(body.rates.GBP).toBe(0.73)
  })

  it('fetches from Frankfurter when not cached', async () => {
    // #given
    const allFn = vi.fn().mockResolvedValue({ results: [] })
    const testEnv = env({ all: allFn })

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ base: 'USD', date: '2026-02-26', rates: { EUR: 0.84, GBP: 0.72 } }),
        { status: 200 },
      ),
    )

    // #when
    const res = await app.request('/currency/rates?base=USD', {}, testEnv)

    // #then
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cached).toBe(false)
    expect(body.rates.EUR).toBe(0.84)
    expect(testEnv.DB.batch).toHaveBeenCalled()
  })

  it('defaults to USD base currency', async () => {
    // #given
    const testEnv = env({
      all: vi.fn().mockResolvedValue({
        results: [{ target_currency: 'EUR', rate: 0.85 }],
      }),
    })

    // #when
    const res = await app.request('/currency/rates', {}, testEnv)

    // #then
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.base).toBe('USD')
  })
})

describe('POST /sync/push', () => {
  it('rejects unauthenticated requests', async () => {
    // #given
    const testEnv = env()

    // #when
    const res = await app.request('/sync/push', { method: 'POST' }, testEnv)

    // #then
    expect(res.status).toBe(401)
  })

  it('rejects empty entries', async () => {
    // #given
    const testEnv = env()
    const jwt = await createTestJwt('user-1')

    // #when
    const res = await app.request(
      '/sync/push',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ entries: [] }),
      },
      testEnv,
    )

    // #then
    expect(res.status).toBe(400)
  })

  it('stores valid sync entries', async () => {
    // #given
    const testEnv = env()
    const jwt = await createTestJwt('user-1')

    // #when
    const res = await app.request(
      '/sync/push',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          entries: [
            {
              id: 'entry-1',
              table_name: 'expenses',
              record_id: 'exp-1',
              action: 'create',
              payload: '{}',
              local_timestamp: '2026-02-26T00:00:00.000Z',
            },
          ],
        }),
      },
      testEnv,
    )

    // #then
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.synced).toBe(1)
    expect(testEnv.DB.batch).toHaveBeenCalled()
  })

  it('rejects invalid table name', async () => {
    // #given
    const testEnv = env()
    const jwt = await createTestJwt('user-1')

    // #when
    const res = await app.request(
      '/sync/push',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          entries: [
            {
              id: 'entry-1',
              table_name: 'invalid_table',
              record_id: 'rec-1',
              action: 'create',
              payload: '{}',
              local_timestamp: '2026-02-26T00:00:00.000Z',
            },
          ],
        }),
      },
      testEnv,
    )

    // #then
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('invalid_table')
  })
})

describe('GET /sync/pull', () => {
  it('rejects unauthenticated requests', async () => {
    // #given
    const testEnv = env()

    // #when
    const res = await app.request('/sync/pull', {}, testEnv)

    // #then
    expect(res.status).toBe(401)
  })

  it('returns entries for authenticated user', async () => {
    // #given
    const testEnv = env({
      all: vi.fn().mockResolvedValue({
        results: [
          {
            id: 'entry-1',
            table_name: 'expenses',
            record_id: 'exp-1',
            action: 'create',
            payload: '{}',
            local_timestamp: '2026-02-26T00:00:00.000Z',
            server_timestamp: '2026-02-26T00:00:01.000Z',
          },
        ],
      }),
    })
    const jwt = await createTestJwt('user-1')

    // #when
    const res = await app.request(
      '/sync/pull?since=2026-02-25T00:00:00.000Z',
      { headers: { Authorization: `Bearer ${jwt}` } },
      testEnv,
    )

    // #then
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entries).toHaveLength(1)
    expect(body.entries[0].table_name).toBe('expenses')
    expect(body.has_more).toBe(false)
  })
})
