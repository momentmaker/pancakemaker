import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { FormSelect } from './FormInput.js'

afterEach(cleanup)

describe('FormSelect', () => {
  it('marks its open dropdown so the keyboard handler stands down', () => {
    render(
      <FormSelect
        label="Currency"
        value="USD"
        onChange={() => {}}
        options={[
          { value: 'USD', label: 'USD' },
          { value: 'EUR', label: 'EUR' },
        ]}
      />,
    )
    expect(document.querySelector('[data-kbd-popover-open]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Currency' }))
    expect(document.querySelector('[data-kbd-popover-open]')).toBeTruthy()
  })
})
