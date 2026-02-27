import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Card } from './Card'
import { Button } from './Button'
import { Badge } from './Badge'
import { AmountDisplay } from './AmountDisplay'
import { SyncIndicator } from './SyncIndicator'
import { EmptyState } from './EmptyState'
import { setupTestDb, renderWithProviders } from '../test-utils'

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>)
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('handles click when onClick provided', () => {
    const onClick = vi.fn()
    render(<Card onClick={onClick}>Clickable</Card>)
    fireEvent.click(screen.getByText('Clickable'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('Button', () => {
  it('renders with primary variant by default', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('handles click', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('can be disabled', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})

describe('Badge', () => {
  it('renders label with color', () => {
    render(<Badge label="Health" color="#00ffcc" />)
    expect(screen.getByText('Health')).toBeInTheDocument()
  })
})

describe('AmountDisplay', () => {
  it('formats cents as dollars', () => {
    render(<AmountDisplay amount={1500} currency="USD" />)
    expect(screen.getByText('$15.00')).toBeInTheDocument()
  })

  it('formats EUR', () => {
    render(<AmountDisplay amount={9999} currency="EUR" />)
    expect(screen.getByText((text) => text.includes('99.99'))).toBeInTheDocument()
  })
})

describe('SyncIndicator', () => {
  beforeEach(async () => {
    await setupTestDb()
  })

  it('shows synced status', () => {
    renderWithProviders(<SyncIndicator status="synced" />)
    expect(screen.getByText('Synced')).toBeInTheDocument()
  })

  it('shows offline status', () => {
    renderWithProviders(<SyncIndicator status="offline" />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('shows local status', () => {
    renderWithProviders(<SyncIndicator status="local" />)
    expect(screen.getByText('Local')).toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('shows message and action', () => {
    const onAction = vi.fn()
    render(<EmptyState message="No expenses" action="Add one" onAction={onAction} />)
    expect(screen.getByText('No expenses')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Add one'))
    expect(onAction).toHaveBeenCalledOnce()
  })
})
