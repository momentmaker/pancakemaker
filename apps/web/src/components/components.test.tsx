import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Card } from './Card'
import { Button } from './Button'
import { Badge } from './Badge'
import { AmountDisplay } from './AmountDisplay'
import { SyncIndicator } from './SyncIndicator'
import { EmptyState } from './EmptyState'
import { QuickAdd } from './QuickAdd'
import type { CategoryRow, PanelRow } from '../db/queries'
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

describe('QuickAdd', () => {
  const personalRouteId = 'p-route'
  const businessRouteId = 'b-route'
  const personalDaily: PanelRow = {
    id: 'p-daily',
    route_id: personalRouteId,
    name: 'Daily',
    currency: 'USD',
    sort_order: 0,
    recurrence_type: null,
    is_default: 1,
    is_archived: 0,
    created_at: '',
    updated_at: '',
  }
  const businessDaily: PanelRow = {
    id: 'b-daily',
    route_id: businessRouteId,
    name: 'Daily',
    currency: 'AED',
    sort_order: 0,
    recurrence_type: null,
    is_default: 1,
    is_archived: 0,
    created_at: '',
    updated_at: '',
  }
  const personalHealth: CategoryRow = {
    id: 'p-health',
    route_id: personalRouteId,
    name: 'Health',
    color: '#00ffcc',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  }
  const businessTravel: CategoryRow = {
    id: 'b-travel',
    route_id: businessRouteId,
    name: 'Travel',
    color: '#fbbf24',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  }

  it('submits with the default panel of the picked category route', async () => {
    // #given
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(
      <QuickAdd
        open
        onClose={() => {}}
        categories={[personalHealth, businessTravel]}
        panels={[personalDaily, businessDaily]}
        personalRouteId={personalRouteId}
        onAdd={onAdd}
      />,
    )

    // #when
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12.34' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: 'Category' }))
    fireEvent.click(screen.getByRole('option', { hidden: true, name: /Travel/ }))
    fireEvent.click(screen.getByRole('button', { hidden: true, name: 'Add' }))

    // #then
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: businessDaily.id,
        categoryId: businessTravel.id,
        currency: 'AED',
        amount: 1234,
      }),
    )
  })

  it('disables submit when no panel exists for the picked category route', () => {
    // #given
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(
      <QuickAdd
        open
        onClose={() => {}}
        categories={[businessTravel]}
        panels={[personalDaily]}
        personalRouteId={personalRouteId}
        onAdd={onAdd}
      />,
    )

    // #when
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '5.00' } })

    // #then
    expect(screen.getByRole('button', { hidden: true, name: 'Add' })).toBeDisabled()
  })

  it('shows route markers when categories span both routes', () => {
    // #given
    render(
      <QuickAdd
        open
        onClose={() => {}}
        categories={[personalHealth, businessTravel]}
        panels={[personalDaily, businessDaily]}
        personalRouteId={personalRouteId}
        onAdd={vi.fn()}
      />,
    )

    // #when
    fireEvent.click(screen.getByRole('button', { hidden: true, name: 'Category' }))

    // #then
    const options = screen.getAllByRole('option', { hidden: true })
    expect(options.find((o) => o.textContent?.includes('Health'))?.textContent).toContain('p')
    expect(options.find((o) => o.textContent?.includes('Travel'))?.textContent).toContain('b')
  })

  it('uses fixed panelId and currency when provided, ignoring panels prop', async () => {
    // #given
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(
      <QuickAdd
        open
        onClose={() => {}}
        categories={[businessTravel]}
        panelId="trip-panel"
        currency="JPY"
        onAdd={onAdd}
      />,
    )

    // #when
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '7.50' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: 'Add' }))

    // #then
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledOnce())
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'trip-panel', currency: 'JPY', amount: 750 }),
    )
  })

  it('omits route markers when categories belong to a single route', () => {
    // #given
    render(
      <QuickAdd
        open
        onClose={() => {}}
        categories={[personalHealth]}
        panels={[personalDaily]}
        personalRouteId={personalRouteId}
        onAdd={vi.fn()}
      />,
    )

    // #when
    fireEvent.click(screen.getByRole('button', { hidden: true, name: 'Category' }))

    // #then
    const options = screen.getAllByRole('option', { hidden: true })
    const labelText = options[0].textContent ?? ''
    expect(labelText.trim()).toBe('Health')
  })
})
