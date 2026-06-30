import { useMemo, useState } from 'react'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  KeyboardCursorProvider,
  useListCursor,
  useKeyboardCursor,
  type CursorItem,
  type KeyboardCursor,
} from './useKeyboardCursor.js'
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

  it('suppresses repeat-fire of mutating actions but keeps non-mutating nav repeating', () => {
    const items = makeItems()
    renderHarness(items)
    fireEvent.keyDown(document, { key: 'j' }) // active: a
    fireEvent.keyDown(document, { key: 'd', repeat: true }) // held d -> suppressed
    expect(items[0].remove).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'd' }) // real press -> delete
    expect(items[0].remove).toHaveBeenCalledOnce()
    fireEvent.keyDown(document, { key: 'j', repeat: true }) // held j still advances
    expect(active()).toBe('b')
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

describe('requestFocus (cross-view targeting)', () => {
  let cursor: KeyboardCursor | null = null

  function Capture() {
    cursor = useKeyboardCursor()
    return <div data-testid="active">{cursor?.activeId ?? 'none'}</div>
  }

  function renderCursor() {
    cursor = null
    render(
      <KeyboardCursorProvider>
        <Capture />
      </KeyboardCursorProvider>,
    )
  }

  const item = (id: string): CursorItem => ({ id })

  it('lands on the requested id when its list registers with prevId already null', () => {
    renderCursor()
    act(() => {
      cursor!.requestFocus('x')
      cursor!.registerList([item('a'), item('x'), item('b')], () => null)
    })
    expect(active()).toBe('x')
  })

  it('survives an empty (loading) registration, then lands when the real list arrives', () => {
    renderCursor()
    act(() => cursor!.requestFocus('x'))
    act(() => cursor!.registerList([], () => null)) // unmount cleanup / loading
    expect(active()).toBe('none')
    act(() => cursor!.registerList([item('x')], () => null)) // data resolves
    expect(active()).toBe('x')
  })

  it('expires the pending target on the first non-matching list — no stale hijack', () => {
    renderCursor()
    act(() => cursor!.requestFocus('x'))
    act(() => cursor!.registerList([item('other')], () => null)) // x not present -> expire
    expect(active()).toBe('none')
    act(() => cursor!.registerList([item('x')], () => null)) // x now present, but pending was cleared
    expect(active()).toBe('none')
  })
})
