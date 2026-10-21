import { screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AuthVerify } from './AuthVerify.js'
import { getStoredToken } from '../sync/api-client.js'
import { logSyncEntry } from '../db/queries.js'
import { renderWithProviders, setupTestDb, getTestDb } from '../test-utils.js'

beforeEach(async () => {
  localStorage.clear()
  await setupTestDb()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AuthVerify', () => {
  it('clears the stored token when reconciling local data fails', async () => {
    // #given
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('/auth/verify')) {
        return new Response(
          JSON.stringify({
            token: 'jwt',
            user: { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' },
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 })
    })

    // #when
    renderWithProviders(<AuthVerify />, '/auth/verify?token=magic')
    await screen.findByText(/failed to sync/i)

    // #then
    expect(getStoredToken()).toBeNull()
  })

  it('explains why it refused to switch accounts with unsynced changes', async () => {
    // #given
    const { db, state } = getTestDb()
    await logSyncEntry(db, state.userId, 'tags', 'tag-1', 'delete', { id: 'tag-1' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'jwt',
          user: { id: 'server-user-id', email: 'real@email.com', baseCurrency: 'USD' },
        }),
        { status: 200 },
      ),
    )

    // #when
    renderWithProviders(<AuthVerify />, '/auth/verify?token=magic')

    // #then
    expect(await screen.findByText(/sign in to that account first/i)).toBeTruthy()
  })
})
