import { type InputHTMLAttributes, useState, useRef, useEffect } from 'react'

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  mono?: boolean
}

export function FormInput({ label, mono = false, className = '', id, ...props }: FormInputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-xs font-medium text-text-secondary">
        {label}
      </label>
      <input
        id={inputId}
        className={`rounded-md border border-border-dim bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-neon-cyan focus:outline-none ${mono ? 'font-mono' : ''} ${className}`}
        {...props}
      />
    </div>
  )
}

interface FormSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  id?: string
}

export function FormSelect({ label, value, onChange, options, id }: FormSelectProps) {
  const selectId = id ?? label.toLowerCase().replace(/\s+/g, '-')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="flex flex-col gap-1.5" ref={ref}>
      {label && (
        <label id={`${selectId}-label`} className="text-xs font-medium text-text-secondary">
          {label}
        </label>
      )}
      <button
        type="button"
        id={selectId}
        aria-labelledby={label ? `${selectId}-label` : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(!open)}
        className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
          open
            ? 'border-neon-cyan bg-bg-primary text-text-primary shadow-[0_0_8px_rgba(0,255,204,0.1)]'
            : 'border-border-dim bg-bg-primary text-text-primary hover:border-border-glow'
        }`}
      >
        <span>{selected?.label ?? ''}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`shrink-0 text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="relative z-20 -mt-0.5 max-h-48 overflow-y-auto rounded-md border border-border-dim bg-bg-card py-1 shadow-lg shadow-black/40"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center px-3 py-1.5 text-left text-sm transition-colors ${
                  isSelected
                    ? 'bg-neon-cyan/10 text-neon-cyan'
                    : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
