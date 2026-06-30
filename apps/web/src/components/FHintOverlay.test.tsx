import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { FHintOverlay, type HintTarget } from './FHintOverlay.js'

afterEach(cleanup)

function target(label: string, top: number, left: number): HintTarget {
  return { label, id: null, element: document.createElement('div'), rect: { top, left } }
}

describe('FHintOverlay', () => {
  it('renders the root as a labelled dialog that stands the shortcut layer down', () => {
    const { getByRole } = render(<FHintOverlay targets={[target('a', 10, 20)]} />)
    const dialog = getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toContain('Hint mode')
    expect(dialog.hasAttribute('data-kbd-popover-open')).toBe(true)
  })

  it('paints one aria-hidden badge per target showing its label', () => {
    const { getByText } = render(
      <FHintOverlay targets={[target('a', 10, 20), target('s', 40, 60)]} />,
    )
    expect(getByText('a').getAttribute('aria-hidden')).toBe('true')
    expect(getByText('s').getAttribute('aria-hidden')).toBe('true')
  })

  it('anchors each badge just inside its target rect', () => {
    const { getByText } = render(<FHintOverlay targets={[target('a', 10, 20)]} />)
    const badge = getByText('a')
    expect(badge.style.top).toBe('12px')
    expect(badge.style.left).toBe('22px')
  })
})
