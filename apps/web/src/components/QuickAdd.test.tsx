import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { QuickAdd } from './QuickAdd.js'
import type { CategoryRow } from '../db/queries'

afterEach(cleanup)

function cat(id: string, name: string): CategoryRow {
  return { id, name, route_id: 'r1', color: '#fff', sort_order: 0 } as unknown as CategoryRow
}

const categories = [cat('meals', 'Meals'), cat('health', 'Health')]

describe('QuickAdd', () => {
  it('starts on the category used last', () => {
    render(
      <QuickAdd
        open
        onClose={vi.fn()}
        categories={categories}
        onAdd={vi.fn()}
        panelId="p1"
        currency="USD"
        defaultCategoryId="health"
      />,
    )
    expect(screen.getByLabelText('Category').textContent).toContain('Health')
  })

  it('falls back to the first category when the remembered one is gone', () => {
    render(
      <QuickAdd
        open
        onClose={vi.fn()}
        categories={categories}
        onAdd={vi.fn()}
        panelId="p1"
        currency="USD"
        defaultCategoryId="deleted"
      />,
    )
    expect(screen.getByLabelText('Category').textContent).toContain('Meals')
  })
})
