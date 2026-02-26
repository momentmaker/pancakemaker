interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  id?: string
}

export function Toggle({ checked, onChange, label, id }: ToggleProps) {
  const toggleId = id ?? label.toLowerCase().replace(/\s+/g, '-')

  return (
    <label htmlFor={toggleId} className="flex cursor-pointer items-center gap-2.5">
      <button
        id={toggleId}
        role="switch"
        type="button"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-all duration-200 ${
          checked
            ? 'border-neon-cyan/40 bg-neon-cyan/15 shadow-[0_0_8px_rgba(0,255,204,0.15)]'
            : 'border-border-dim bg-bg-elevated'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all duration-200 ${
            checked
              ? 'left-[18px] bg-neon-cyan shadow-[0_0_6px_rgba(0,255,204,0.4)]'
              : 'left-0.5 bg-text-muted'
          }`}
        />
      </button>
      <span className="text-xs text-text-muted">{label}</span>
    </label>
  )
}
