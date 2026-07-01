import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { KeyboardCursorProvider } from './useKeyboardCursor.js'
import { useKeyboardShortcuts } from './useKeyboardShortcuts.js'
import { useExpenseListCursor } from './useExpenseListCursor.js'
import type { ExpenseRowHandle } from '../components/ExpenseRow'

afterEach(cleanup)

interface Spies {
  arm: Mock
  confirm: Mock
  cancel: Mock
}

const FakeRow = forwardRef<ExpenseRowHandle, { id: string; spies: Spies }>(function FakeRow(
  { id, spies },
  ref,
) {
  const [confirming, setConfirming] = useState(false)
  const confirmingRef = useRef(confirming)
  confirmingRef.current = confirming

  useImperativeHandle(
    ref,
    () => ({
      startEdit: () => {},
      startConfirmDelete: () => {
        setConfirming(true)
        spies.arm()
      },
      confirmDelete: () => {
        setConfirming(false)
        spies.confirm()
      },
      cancelConfirm: () => {
        setConfirming(false)
        spies.cancel()
      },
      isConfirming: () => confirmingRef.current,
      duplicate: () => {},
    }),
    [spies],
  )

  return (
    <div data-kbd-item-id={id} tabIndex={-1}>
      {id}
    </div>
  )
})

function Harness({ ids, spiesById }: { ids: string[]; spiesById: Record<string, Spies> }) {
  useKeyboardShortcuts({ onCheatsheet: () => {} })
  const { containerRef, rowRef } = useExpenseListCursor(ids)
  return (
    <div ref={containerRef}>
      {ids.map((id) => (
        <FakeRow key={id} id={id} ref={rowRef(id)} spies={spiesById[id]} />
      ))}
    </div>
  )
}

function makeSpies(): Spies {
  return { arm: vi.fn(), confirm: vi.fn(), cancel: vi.fn() }
}

function renderHarness(ids: string[], spiesById: Record<string, Spies>) {
  return render(
    <MemoryRouter>
      <KeyboardCursorProvider>
        <Harness ids={ids} spiesById={spiesById} />
      </KeyboardCursorProvider>
    </MemoryRouter>,
  )
}

describe('useExpenseListCursor', () => {
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

  it('arms the cursored row on the first d, confirms on the second', () => {
    const spies = { a: makeSpies(), b: makeSpies() }
    renderHarness(['a', 'b'], spies)

    fireEvent.keyDown(document, { key: 'j' }) // cursor on a
    fireEvent.keyDown(document, { key: 'd' })
    expect(spies.a.arm).toHaveBeenCalledOnce()
    expect(spies.a.confirm).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'd' })
    expect(spies.a.confirm).toHaveBeenCalledOnce()
  })

  it('disarms a row when the cursor moves away from it', () => {
    const spies = { a: makeSpies(), b: makeSpies() }
    renderHarness(['a', 'b'], spies)

    fireEvent.keyDown(document, { key: 'j' }) // cursor on a
    fireEvent.keyDown(document, { key: 'd' }) // arm a
    expect(spies.a.arm).toHaveBeenCalledOnce()

    fireEvent.keyDown(document, { key: 'j' }) // move to b -> disarm a
    expect(spies.a.cancel).toHaveBeenCalledOnce()
  })
})
