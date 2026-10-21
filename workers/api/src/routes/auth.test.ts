import { describe, it, expect, beforeEach } from 'vitest'
import app from '../index.js'
import { createTestD1, type TestD1 } from '../test-d1.js'

const JWT_SECRET = 'test-secret-key-for-testing'

let d1: TestD1

beforeEach(() => {
  d1 = createTestD1()
})

async function verify(token: string): Promise<Response> {
  return app.request(
    '/auth/verify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    },
    { DB: d1.db, JWT_SECRET },
  )
}

describe('POST /auth/verify', () => {
  it('signs both requests in to one new user when two verifications for a new email race', async () => {
    // #given
    d1.insertAuthToken({ id: 'tok-1', email: 'new@example.com', token: 'token-1' })
    d1.insertAuthToken({ id: 'tok-2', email: 'new@example.com', token: 'token-2' })

    // #when
    const responses = await Promise.all([verify('token-1'), verify('token-2')])

    // #then
    const statuses = responses.map((r) => r.status)
    const userIds = await Promise.all(
      responses.map(async (r) =>
        r.ok ? ((await r.json()) as { user: { id: string } }).user.id : null,
      ),
    )
    expect({ statuses, sameUser: userIds[0] !== null && userIds[0] === userIds[1] }).toEqual({
      statuses: [200, 200],
      sameUser: true,
    })
  })
})
