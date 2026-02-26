import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-neon-cyan text-bg-primary font-semibold hover:bg-neon-cyan/80 active:bg-neon-cyan/60',
  secondary:
    'border border-border-dim bg-bg-card text-text-primary hover:border-border-glow hover:text-neon-cyan',
  ghost: 'text-text-secondary hover:text-text-primary hover:bg-bg-card',
  danger: 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30',
}

export function Button({ variant = 'primary', children, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
