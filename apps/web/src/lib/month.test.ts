import { describe, it, expect } from 'vitest'
import { addMonths } from './month.js'

describe('addMonths', () => {
  it('advances and rewinds within a year', () => {
    expect(addMonths('2026-06', 1)).toBe('2026-07')
    expect(addMonths('2026-06', -1)).toBe('2026-05')
  })

  it('rolls across year boundaries', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('is a no-op for delta 0 and round-trips +1 then -1', () => {
    expect(addMonths('2026-06', 0)).toBe('2026-06')
    expect(addMonths(addMonths('2026-06', 1), -1)).toBe('2026-06')
  })
})
