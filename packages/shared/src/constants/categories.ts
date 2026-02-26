export interface DefaultCategory {
  name: string
  color: string
}

export const PERSONAL_CATEGORIES: DefaultCategory[] = [
  { name: 'Health', color: '#00ffcc' },
  { name: 'Meals', color: '#ff6b9d' },
  { name: 'Learning', color: '#c084fc' },
  { name: 'Gifts', color: '#fbbf24' },
  { name: 'Entertainment', color: '#22d3ee' },
  { name: 'Transport', color: '#a3e635' },
  { name: 'Housing', color: '#f97316' },
  { name: 'Utilities', color: '#64748b' },
  { name: 'Subscriptions', color: '#e879f9' },
  { name: 'Shopping', color: '#38bdf8' },
]

export const BUSINESS_CATEGORIES: DefaultCategory[] = [
  { name: 'Hosting', color: '#00ffcc' },
  { name: 'Tools', color: '#ff6b9d' },
  { name: 'Marketing', color: '#c084fc' },
  { name: 'Travel', color: '#fbbf24' },
  { name: 'Meals', color: '#22d3ee' },
  { name: 'Office', color: '#a3e635' },
  { name: 'Professional Services', color: '#f97316' },
  { name: 'Insurance', color: '#64748b' },
]
