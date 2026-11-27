import { formatCurrency } from './format.js'

interface DescribedExpense {
  description: string | null
  amount: number
  currency: string
}

function nameOf(expense: DescribedExpense): string {
  return expense.description || 'expense'
}

export function deletedMessage(expense: DescribedExpense): string {
  return `Deleted ${nameOf(expense)} · ${formatCurrency(expense.amount, expense.currency)}`
}

export function stoppedMessage(expense: DescribedExpense): string {
  return `Stopped ${nameOf(expense)} repeating`
}
