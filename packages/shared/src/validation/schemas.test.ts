import { describe, it, expect } from 'vitest'
import { expenseSchema, createExpenseSchema, categorySchema, userSchema } from './schemas.js'

describe('userSchema', () => {
  it('validates a valid user', () => {
    const user = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com',
      base_currency: 'USD',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    expect(userSchema.parse(user)).toEqual(user)
  })

  it('rejects invalid email', () => {
    const user = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'not-an-email',
      base_currency: 'USD',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    expect(() => userSchema.parse(user)).toThrow()
  })
})

describe('categorySchema', () => {
  it('validates a valid category', () => {
    const category = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      route_id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Health',
      color: '#00ffcc',
      sort_order: 0,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    expect(categorySchema.parse(category)).toEqual(category)
  })

  it('rejects invalid hex color', () => {
    const category = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      route_id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Health',
      color: 'red',
      sort_order: 0,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    expect(() => categorySchema.parse(category)).toThrow()
  })
})

describe('expenseSchema', () => {
  it('validates a valid expense', () => {
    const expense = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      panel_id: '550e8400-e29b-41d4-a716-446655440001',
      category_id: '550e8400-e29b-41d4-a716-446655440002',
      amount: 1500,
      currency: 'USD',
      description: 'Lunch',
      date: '2026-01-15',
      is_recurring: false,
      recurrence_type: null,
      recurrence_end_date: null,
      recurrence_day: null,
      source_expense_id: null,
      created_at: '2026-01-15T12:00:00.000Z',
      updated_at: '2026-01-15T12:00:00.000Z',
      deleted_at: null,
    }
    expect(expenseSchema.parse(expense)).toEqual(expense)
  })

  it('validates recurring expense', () => {
    const expense = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      panel_id: '550e8400-e29b-41d4-a716-446655440001',
      category_id: '550e8400-e29b-41d4-a716-446655440002',
      amount: 9900,
      currency: 'USD',
      date: '2026-01-01',
      is_recurring: true,
      recurrence_type: 'monthly',
      recurrence_end_date: '2026-12-31',
      recurrence_day: null,
      source_expense_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
    }
    expect(expenseSchema.parse(expense)).toEqual(expense)
  })
})

describe('createExpenseSchema', () => {
  it('validates create payload without id or timestamps', () => {
    const payload = {
      panel_id: '550e8400-e29b-41d4-a716-446655440001',
      category_id: '550e8400-e29b-41d4-a716-446655440002',
      amount: 1500,
      currency: 'USD',
      date: '2026-01-15',
      is_recurring: false,
      recurrence_type: null,
      recurrence_end_date: null,
      recurrence_day: null,
      source_expense_id: null,
    }
    expect(createExpenseSchema.parse(payload)).toEqual(payload)
  })
})
