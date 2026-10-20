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
