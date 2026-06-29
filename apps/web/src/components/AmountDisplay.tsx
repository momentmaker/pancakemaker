import { formatCurrency } from '../lib/format'

interface AmountDisplayProps {
  amount: number
  currency: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeStyles = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl',
}

export function AmountDisplay({ amount, currency, size = 'md' }: AmountDisplayProps) {
  return (
    <span className={`font-mono font-semibold ${sizeStyles[size]}`}>
      {formatCurrency(amount, currency)}
    </span>
  )
}
