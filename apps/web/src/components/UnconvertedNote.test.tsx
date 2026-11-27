import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { UnconvertedNote } from './UnconvertedNote.js'

afterEach(cleanup)

describe('UnconvertedNote', () => {
  it('explains which amounts were left out of the total', () => {
    // #when
    render(<UnconvertedNote summary={{ count: 2, currencies: ['JPY'] }} />)

    // #then
    expect(screen.getByText('Excludes 2 amounts in JPY — no exchange rate yet')).toBeTruthy()
  })

  it('renders nothing when every amount converted', () => {
    // #when
    const { container } = render(<UnconvertedNote summary={{ count: 0, currencies: [] }} />)

    // #then
    expect(container.innerHTML).toBe('')
  })
})
