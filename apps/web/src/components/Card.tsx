import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  glow?: boolean
  onClick?: () => void
}

export function Card({ children, className = '', glow = false, onClick }: CardProps) {
  return (
    <div
      className={`rounded-lg border bg-bg-card p-4 transition-all duration-200 ${
        glow ? 'border-border-glow shadow-[0_0_15px_rgba(0,255,204,0.1)]' : 'border-border-dim'
      } ${onClick ? 'cursor-pointer hover:border-border-glow hover:shadow-[0_0_15px_rgba(0,255,204,0.08)]' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {children}
    </div>
  )
}
