import { useMemo, useState } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { KeyboardCursorProvider, useListCursor, type CursorItem } from './useKeyboardCursor.js'
import { useKeyboardShortcuts } from './useKeyboardShortcuts.js'

afterEach(cleanup)

function ItemList({ items, activeId }: { items: CursorItem[]; activeId: string | null }) {
  return (
    <>
      <div data-testid="active">{activeId ?? 'none'}</div>
      <ul>
        {items.map((item) => (
          <li key={item.id} id={`item-${item.id}`} tabIndex={-1}>
            {item.id}
          </li>
        ))}
      </ul>
    </>
  )
}

function Harness({ items }: { items: CursorItem[] }) {
  useKeyboardShortcuts({ onCheatsheet: () => {} })
  const activeId = useListCursor(items, (id) => document.getElementById(`item-${id}`))
  return <ItemList items={items} activeId={activeId} />
}

function renderHarness(items: CursorItem[]) {
  return render(
    <MemoryRouter>
      <KeyboardCursorProvider>
        <Harness items={items} />
      </KeyboardCursorProvider>
    </MemoryRouter>,
  )
}

function active(): string {
  return screen.getByTestId('active').textContent ?? ''
}

describe('keyboard cursor', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  function makeItems(): CursorItem[] {
    return [
      { id: 'a', open: vi.fn(), remove: vi.fn(), duplicate: vi.fn() },
      { id: 'b', open: vi.fn(), remove: vi.fn(), duplicate: vi.fn() },
      { id: 'c', open: vi.fn(), remove: vi.fn(), duplicate: vi.fn() },
    ]
  }

  it('j selects the first item, then advances', () => {
    renderHarness(makeItems())
    fireEvent.keyDown(document, { key: 'j' })
    expect(active()).toBe('a')
    fireEvent.keyDown(document, { key: 'j' })
    expect(active()).toBe('b')
  })

  it('k moves up and clamps at the top', () => {
    renderHarness(makeItems())
    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: 'k' })
    expect(active()).toBe('a')
    fireEvent.keyDown(document, { key: 'k' })
    expect(active()).toBe('a')
  })

  it('G jumps to last and gg to first', () => {
    renderHarness(makeItems())
    fireEvent.keyDown(document, { key: 'G' })
    expect(active()).toBe('c')
    fireEvent.keyDown(document, { key: 'g' })
    fireEvent.keyDown(document, { key: 'g' })
    expect(active()).toBe('a')
  })

  it('moves native focus to the active item', () => {
    renderHarness(makeItems())
    fireEvent.keyDown(document, { key: 'j' })
    expect(document.activeElement?.id).toBe('item-a')
  })

  it('o opens, d deletes, and yy duplicates the active item', () => {
    const items = makeItems()
    renderHarness(items)
    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: 'o' })
    expect(items[0].open).toHaveBeenCalledOnce()
    fireEvent.keyDown(document, { key: 'd' })
    expect(items[0].remove).toHaveBeenCalledOnce()
    fireEvent.keyDown(document, { key: 'y' })
    fireEvent.keyDown(document, { key: 'y' })
    expect(items[0].duplicate).toHaveBeenCalledOnce()
  })

  it('Escape clears the cursor', () => {
    renderHarness(makeItems())
    fireEvent.keyDown(document, { key: 'j' })
    expect(active()).toBe('a')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(active()).toBe('none')
  })

  it('reanchors to the nearest surviving sibling after a delete', () => {
    function ReanchorHarness() {
      const [ids, setIds] = useState(['a', 'b', 'c'])
      const items = useMemo<CursorItem[]>(
        () => ids.map((id) => ({ id, remove: () => setIds((cur) => cur.filter((x) => x !== id)) })),
        [ids],
      )
      useKeyboardShortcuts({ onCheatsheet: () => {} })
      const activeId = useListCursor(items, (id) => document.getElementById(`item-${id}`))
      return <ItemList items={items} activeId={activeId} />
    }
    render(
      <MemoryRouter>
        <KeyboardCursorProvider>
          <ReanchorHarness />
        </KeyboardCursorProvider>
      </MemoryRouter>,
    )
    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: 'j' }) // active: b
    expect(active()).toBe('b')
    fireEvent.keyDown(document, { key: 'd' }) // delete b -> reanchor to its slot (c)
    expect(screen.queryByText('b')).toBeNull()
    expect(active()).toBe('c')
  })
})
