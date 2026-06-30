import { render, act, cleanup, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FHintProvider, useFHints } from './useFHints.js'
import { HINT_LABELS } from '../lib/keyboard/fhints.js'

const { activateItem } = vi.hoisted(() => ({ activateItem: vi.fn() }))
vi.mock('./useKeyboardCursor', () => ({
  useKeyboardCursor: () => ({ activateItem }),
}))

let openFHints: (() => void) | null = null
function Capture() {
  openFHints = useFHints()?.openFHints ?? null
  return null
}

function stubRect(el: Element, top: number, left: number, width = 40, height = 20) {
  el.getBoundingClientRect = () =>
    ({
      top,
      left,
      width,
      height,
      bottom: top + height,
      right: left + width,
      x: left,
      y: top,
      toJSON: () => {},
    }) as DOMRect
}

function open() {
  act(() => openFHints?.())
}

beforeEach(() => {
  activateItem.mockClear()
  openFHints = null
})
afterEach(cleanup)

describe('FHintProvider / useFHints', () => {
  it('badges only the visible marked targets, home-row first, in reading order (AE1)', () => {
    const { container } = render(
      <FHintProvider>
        <div data-kbd-item-id="card-1" data-testid="card">
          card
        </div>
        <button data-fhint data-testid="btn">
          btn
        </button>
        <div data-testid="plain">unmarked chrome</div>
        <Capture />
      </FHintProvider>,
    )
    stubRect(container.querySelector('[data-testid="card"]')!, 50, 10)
    stubRect(container.querySelector('[data-testid="btn"]')!, 10, 10)
    stubRect(container.querySelector('[data-testid="plain"]')!, 5, 10)

    open()

    const dialog = container.querySelector('[role="dialog"]')!
    const badges = Array.from(dialog.querySelectorAll('span')).map((s) => s.textContent)
    expect(badges).toEqual(['a', 's'])
    expect(container.querySelector('[data-testid="btn"]')!.textContent).toBe('btn')
  })

  it('never badges unmarked utility chrome (AE5)', () => {
    const { container } = render(
      <FHintProvider>
        <div data-fhint data-testid="marked">
          marked
        </div>
        <div data-testid="chrome">just chrome</div>
        <button data-testid="bare">bare button</button>
        <Capture />
      </FHintProvider>,
    )
    stubRect(container.querySelector('[data-testid="marked"]')!, 10, 10)
    stubRect(container.querySelector('[data-testid="chrome"]')!, 20, 10)
    stubRect(container.querySelector('[data-testid="bare"]')!, 30, 10)

    open()

    const badges = container.querySelectorAll('[role="dialog"] span')
    expect(badges.length).toBe(1)
  })

  it('activates a cursor-registered target via activateItem(id) (AE2)', () => {
    const { container } = render(
      <FHintProvider>
        <div data-kbd-item-id="card-7" data-testid="card">
          card
        </div>
        <Capture />
      </FHintProvider>,
    )
    stubRect(container.querySelector('[data-testid="card"]')!, 10, 10)
    open()

    fireEvent.keyDown(document, { key: 'a' })

    expect(activateItem).toHaveBeenCalledWith('card-7')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('activates a plain marked target via element.click() (AE3)', () => {
    const { container } = render(
      <FHintProvider>
        <button data-fhint data-testid="btn">
          btn
        </button>
        <Capture />
      </FHintProvider>,
    )
    const btn = container.querySelector('[data-testid="btn"]')! as HTMLElement
    btn.click = vi.fn()
    stubRect(btn, 10, 10)
    open()

    fireEvent.keyDown(document, { key: 'a' })

    expect(btn.click).toHaveBeenCalledTimes(1)
    expect(activateItem).not.toHaveBeenCalled()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('exits silently on a mistype, activating nothing (AE4)', () => {
    const { container } = render(
      <FHintProvider>
        <div data-kbd-item-id="card-1" data-testid="card">
          card
        </div>
        <Capture />
      </FHintProvider>,
    )
    stubRect(container.querySelector('[data-testid="card"]')!, 10, 10)
    open()

    fireEvent.keyDown(document, { key: 'z' })

    expect(activateItem).not.toHaveBeenCalled()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('exits on Escape, activating nothing', () => {
    const { container } = render(
      <FHintProvider>
        <div data-kbd-item-id="card-1" data-testid="card">
          card
        </div>
        <Capture />
      </FHintProvider>,
    )
    stubRect(container.querySelector('[data-testid="card"]')!, 10, 10)
    open()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(activateItem).not.toHaveBeenCalled()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('excludes off-screen targets from the badge set', () => {
    const { container } = render(
      <FHintProvider>
        <div data-fhint data-testid="onscreen">
          on
        </div>
        <div data-fhint data-testid="offscreen">
          off
        </div>
        <Capture />
      </FHintProvider>,
    )
    stubRect(container.querySelector('[data-testid="onscreen"]')!, 10, 10)
    stubRect(container.querySelector('[data-testid="offscreen"]')!, window.innerHeight + 100, 10)

    open()

    const badges = container.querySelectorAll('[role="dialog"] span')
    expect(badges.length).toBe(1)
  })

  it('does not enter f-mode when no target is visible (empty view)', () => {
    const { container } = render(
      <FHintProvider>
        <div data-fhint data-testid="offscreen">
          off
        </div>
        <Capture />
      </FHintProvider>,
    )
    stubRect(container.querySelector('[data-testid="offscreen"]')!, window.innerHeight + 100, 10)

    open()

    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('exits when the layout scrolls (stale snapshot)', () => {
    const { container } = render(
      <FHintProvider>
        <div data-fhint data-testid="btn">
          btn
        </div>
        <Capture />
      </FHintProvider>,
    )
    stubRect(container.querySelector('[data-testid="btn"]')!, 10, 10)
    open()
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()

    fireEvent.scroll(window)

    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('blurs the focused element on open so its handlers cannot fire under f-mode', () => {
    const { container } = render(
      <FHintProvider>
        <input data-testid="field" />
        <div data-fhint data-testid="btn">
          btn
        </div>
        <Capture />
      </FHintProvider>,
    )
    const field = container.querySelector('[data-testid="field"]')! as HTMLElement
    field.focus()
    expect(document.activeElement).toBe(field)
    stubRect(container.querySelector('[data-testid="btn"]')!, 10, 10)

    open()

    expect(document.activeElement).not.toBe(field)
  })

  it('exposes the a11y contract: dialog role, label, popover marker, aria-hidden badges', () => {
    const { container } = render(
      <FHintProvider>
        <div data-fhint data-testid="btn">
          btn
        </div>
        <Capture />
      </FHintProvider>,
    )
    stubRect(container.querySelector('[data-testid="btn"]')!, 10, 10)
    open()

    const dialog = container.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-label')).toContain('Hint mode')
    expect(dialog.hasAttribute('data-kbd-popover-open')).toBe(true)
    expect(dialog.querySelector('span')!.getAttribute('aria-hidden')).toBe('true')
  })

  it('caps the badge set at the label pool, dropping the overflow', () => {
    const count = HINT_LABELS.length + 1
    const { container } = render(
      <FHintProvider>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} data-fhint data-testid={`t-${i}`}>
            t{i}
          </div>
        ))}
        <Capture />
      </FHintProvider>,
    )
    Array.from({ length: count }, (_, i) =>
      stubRect(container.querySelector(`[data-testid="t-${i}"]`)!, 10 + i * 10, 10),
    )

    open()

    const badges = container.querySelectorAll('[role="dialog"] span')
    expect(badges.length).toBe(HINT_LABELS.length)
  })
})
