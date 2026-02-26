import { screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { App } from './App'
import { setupTestDb, renderWithProviders } from './test-utils'

beforeEach(async () => {
  await setupTestDb()
})

describe('App routing', () => {
  it('renders dashboard at /', () => {
    renderWithProviders(<App />, '/')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('renders personal route at /personal', () => {
    renderWithProviders(<App />, '/personal')
    expect(screen.getByRole('heading', { name: 'Personal' })).toBeInTheDocument()
  })

  it('renders business route at /business', () => {
    renderWithProviders(<App />, '/business')
    expect(screen.getByRole('heading', { name: 'Business' })).toBeInTheDocument()
  })

  it('renders settings at /settings', () => {
    renderWithProviders(<App />, '/settings')
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it('renders login at /auth/login', () => {
    renderWithProviders(<App />, '/auth/login')
    expect(screen.getByText('Send Magic Link')).toBeInTheDocument()
  })

  it('renders navigation links', () => {
    renderWithProviders(<App />, '/')
    expect(screen.getByText('pancakemaker')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: 'Personal' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: 'Business' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: 'Settings' }).length).toBeGreaterThanOrEqual(1)
  })
})
