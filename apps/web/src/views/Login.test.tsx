import { screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Login } from './Login.js'
import { getStoredToken } from '../sync/api-client.js'
import { renderWithProviders, setupTestDb } from '../test-utils.js'

beforeEach(async () => {
  localStorage.clear()
  await setupTestDb()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Login', () => {
  it('clears the stored token when reconciling local data fails', async () => {
    // #given
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/auth/magic-link')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      if (url.includes('/auth/verify-code')) {
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
    renderWithProviders(<Login />, '/login')
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'real@email.com' },
    })
    fireEvent.submit(screen.getByPlaceholderText('you@example.com').closest('form')!)
    await screen.findByText(/enter the code/i)

    // #when
    fireEvent.paste(screen.getAllByRole('textbox')[0], {
      clipboardData: { getData: () => '123456' },
    })
    await screen.findByText(/failed to sync/i)

    // #then
    expect(getStoredToken()).toBeNull()
  })
})
