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
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount / 100)

  return <span className={`font-mono font-semibold ${sizeStyles[size]}`}>{formatted}</span>
}
