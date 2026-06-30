import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { CommandPalette } from './CommandPalette.js'
import type { CommandItem } from '../lib/command-palette/types.js'

afterEach(cleanup)

// jsdom's showModal() does not mark a <dialog> accessible, so dom-accessibility-api
// treats its contents as hidden — query the input by placeholder and pass
// { hidden: true } to role lookups. The ARIA roles are correct for real browsers.
function input(): HTMLInputElement {
  return screen.getByPlaceholderText('Jump to anything…') as HTMLInputElement
}

function makeItems(): CommandItem[] {
  return [
    { id: 'r:dash', group: 'Routes', label: 'Dashboard', matchText: 'Dashboard', run: vi.fn() },
    { id: 'r:biz', group: 'Routes', label: 'Business', matchText: 'Business', run: vi.fn() },
    { id: 'r:set', group: 'Routes', label: 'Settings', matchText: 'Settings', run: vi.fn() },
    {
      id: 'c:meals',
      group: 'Categories',
      label: 'Meals',
      sublabel: 'Personal',
      matchText: 'Meals Personal',
      run: vi.fn(),
    },
    {
      id: 'e:fw',
      group: 'Recent expenses',
      label: 'flat white',
      sublabel: 'Meals · $12.50',
      matchText: 'flat white Meals 12.50',
      run: vi.fn(),
    },
    { id: 'a:add', group: 'Actions', label: 'Add expense', matchText: 'Add expense', run: vi.fn() },
    { id: 'a:sync', group: 'Actions', label: 'Sync now', matchText: 'Sync now', run: vi.fn() },
  ]
}

describe('CommandPalette', () => {
  it('does not focus the input while closed', () => {
    render(<CommandPalette open={false} items={makeItems()} onClose={vi.fn()} />)
    expect(document.activeElement).not.toBe(input())
  })

  it('autofocuses the input and shows the default set when opened', () => {
    render(<CommandPalette open items={makeItems()} onClose={vi.fn()} />)
    expect(document.activeElement).toBe(input())
    // Default set = routes + recent + actions; categories are excluded.
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('flat white')).toBeInTheDocument()
    expect(screen.getByText('Add expense')).toBeInTheDocument()
    expect(screen.queryByText('Meals')).toBeNull()
  })

  it('filters and ranks on typing — Business first for "bus"', () => {
    render(<CommandPalette open items={makeItems()} onClose={vi.fn()} />)
    fireEvent.change(input(), { target: { value: 'bus' } })
    const options = screen.getAllByRole('option', { hidden: true })
    expect(options[0]).toHaveTextContent('Business')
  })

  it('moves the highlight with arrows (wrapping) and runs the highlighted item on Enter', () => {
    const items = makeItems()
    const onClose = vi.fn()
    render(<CommandPalette open items={items} onClose={onClose} />)
    fireEvent.keyDown(input(), { key: 'ArrowDown' }) // 0 -> 1 (Business)
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(items[1].run).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('wraps the highlight to the last item when arrowing up from the top', () => {
    render(<CommandPalette open items={makeItems()} onClose={vi.fn()} />)
    fireEvent.keyDown(input(), { key: 'ArrowUp' }) // 0 -> last (wrap)
    // Default set order: [Dashboard, Business, Settings, flat white, Add expense, Sync now]
    expect(input().getAttribute('aria-activedescendant')).toBe('a:sync')
  })

  it('tracks the highlighted row via aria-activedescendant and ARIA roles', () => {
    render(<CommandPalette open items={makeItems()} onClose={vi.fn()} />)
    expect(input().getAttribute('role')).toBe('combobox')
    expect(input().getAttribute('aria-activedescendant')).toBe('r:dash')
    expect(screen.getByRole('listbox', { hidden: true })).toBeInTheDocument()
    expect(screen.getAllByRole('option', { hidden: true }).length).toBeGreaterThan(0)
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(input().getAttribute('aria-activedescendant')).toBe('r:biz')
  })

  it('resets the highlight to the first row when the query changes the result set', () => {
    render(<CommandPalette open items={makeItems()} onClose={vi.fn()} />)
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' }) // highlight 2
    fireEvent.change(input(), { target: { value: 'set' } }) // narrows to Settings
    const options = screen.getAllByRole('option', { hidden: true })
    expect(options[0].getAttribute('aria-selected')).toBe('true')
  })

  it('shows a no-results row for a non-matching query', () => {
    render(<CommandPalette open items={makeItems()} onClose={vi.fn()} />)
    fireEvent.change(input(), { target: { value: 'zzzzz' } })
    expect(screen.getByText(/No results for/)).toBeInTheDocument()
    expect(screen.queryAllByRole('option', { hidden: true })).toHaveLength(0)
  })

  it('runs an item and closes on click', () => {
    const items = makeItems()
    const onClose = vi.fn()
    render(<CommandPalette open items={items} onClose={onClose} />)
    fireEvent.click(screen.getByText('Sync now'))
    expect(items.find((i) => i.id === 'a:sync')!.run).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<CommandPalette open items={makeItems()} onClose={onClose} />)
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('marks itself a keyboard popover only while open so global shortcuts stand down', () => {
    const { container, rerender } = render(
      <CommandPalette open items={makeItems()} onClose={vi.fn()} />,
    )
    expect(container.querySelector('[data-kbd-popover-open]')).not.toBeNull()
    // Closed: the marker must be gone, or the always-mounted dialog would stand
    // the global shortcut layer down forever.
    rerender(<CommandPalette open={false} items={makeItems()} onClose={vi.fn()} />)
    expect(container.querySelector('[data-kbd-popover-open]')).toBeNull()
  })
})
