import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CaptureBar } from './CaptureBar.js'

describe('CaptureBar', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <CaptureBar open={false} routeLabel="Personal" onSubmit={vi.fn()} onClose={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the target route and autofocuses its input when open', () => {
    render(<CaptureBar open routeLabel="Business" onSubmit={vi.fn()} onClose={vi.fn()} />)
    const input = screen.getByLabelText('Quick capture to Business')
    expect(document.activeElement).toBe(input)
  })

  it('submits the typed line on Enter', () => {
    const onSubmit = vi.fn()
    render(<CaptureBar open routeLabel="Personal" onSubmit={onSubmit} onClose={vi.fn()} />)
    const input = screen.getByLabelText(/Quick capture/) as HTMLInputElement
    fireEvent.change(input, { target: { value: '12.50 coffee #meals' } })
    fireEvent.submit(input.closest('form')!)
    expect(onSubmit).toHaveBeenCalledWith('12.50 coffee #meals')
  })

  it('closes on Escape without submitting', () => {
    const onSubmit = vi.fn()
    const onClose = vi.fn()
    render(<CaptureBar open routeLabel="Personal" onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.keyDown(screen.getByLabelText(/Quick capture/), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('marks itself a keyboard popover so global shortcuts stand down', () => {
    const { container } = render(
      <CaptureBar open routeLabel="Personal" onSubmit={vi.fn()} onClose={vi.fn()} />,
    )
    expect(container.querySelector('[data-kbd-popover-open]')).not.toBeNull()
  })
})
