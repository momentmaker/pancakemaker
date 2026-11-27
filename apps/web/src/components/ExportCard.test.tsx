import { screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderWithProviders, setupTestDb } from '../test-utils.js'

const exportData = vi.fn().mockResolvedValue(undefined)
vi.mock('../lib/export', () => ({ exportData: (...args: unknown[]) => exportData(...args) }))

const { ExportCard } = await import('./ExportCard.js')

afterEach(cleanup)

describe('ExportCard', () => {
  beforeEach(async () => {
    exportData.mockClear()
    await setupTestDb()
  })

  it('exports everything when no dates are set', () => {
    renderWithProviders(<ExportCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    expect(exportData.mock.calls[0].slice(2)).toEqual(['csv', {}])
  })

  it('fills in last year from its shortcut', () => {
    renderWithProviders(<ExportCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Last year' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tax envelope' }))
    const lastYear = new Date().getFullYear() - 1
    expect(exportData.mock.calls[0].slice(2)).toEqual([
      'tax',
      { from: `${lastYear}-01-01`, to: `${lastYear}-12-31` },
    ])
  })

  it('uses dates typed into the range', () => {
    renderWithProviders(<ExportCard />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-04-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-06-30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }))
    expect(exportData.mock.calls[0].slice(2)).toEqual([
      'json',
      { from: '2026-04-01', to: '2026-06-30' },
    ])
  })
})
