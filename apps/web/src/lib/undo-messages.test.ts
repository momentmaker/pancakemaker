import { describe, it, expect } from 'vitest'
import { deletedMessage, stoppedMessage } from './undo-messages.js'

const rent = { description: 'Rent', amount: 150000, currency: 'USD' }

describe('deletedMessage', () => {
  it('names the expense and its amount', () => {
    expect(deletedMessage(rent)).toBe('Deleted Rent · $1,500.00')
  })

  it('falls back to a generic name when there is no description', () => {
    expect(deletedMessage({ ...rent, description: null })).toBe('Deleted expense · $1,500.00')
  })
})

describe('stoppedMessage', () => {
  it('says the series stopped repeating', () => {
    expect(stoppedMessage(rent)).toBe('Stopped Rent repeating')
  })
})
