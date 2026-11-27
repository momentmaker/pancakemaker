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

  it('logs a usual expense with one tap', () => {
    // #given
    const onPickUsual = vi.fn()
    render(
      <CaptureBar
        open
        routeLabel="Personal"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        usuals={[{ key: 'u1', label: 'Coffee', detail: '$4.50 · Meals' }]}
        onPickUsual={onPickUsual}
      />,
    )

    // #when
    fireEvent.click(screen.getByRole('button', { name: /Coffee/ }))

    // #then
    expect(onPickUsual).toHaveBeenCalledWith('u1')
  })

  it('hands the typed line to the full form', () => {
    // #given
    const onMore = vi.fn()
    render(
      <CaptureBar
        open
        routeLabel="Personal"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        onMore={onMore}
      />,
    )
    fireEvent.change(screen.getByLabelText(/Quick capture/), { target: { value: '12 lunch' } })

    // #when
    fireEvent.click(screen.getByRole('button', { name: 'More…' }))

    // #then
    expect(onMore).toHaveBeenCalledWith('12 lunch')
  })

  it('closes from its close button, for touch screens without Escape', () => {
    // #given
    const onClose = vi.fn()
    render(<CaptureBar open routeLabel="Personal" onSubmit={vi.fn()} onClose={onClose} />)

    // #when
    fireEvent.click(screen.getByRole('button', { name: 'Close capture' }))

    // #then
    expect(onClose).toHaveBeenCalledOnce()
  })
})
