export interface UnconvertedSummary {
  count: number
  currencies: string[]
}

export function convertAmount(
  amount: number,
  fromCurrency: string,
  baseCurrency: string,
  rates: ReadonlyMap<string, number>,
): number | null {
  if (fromCurrency === baseCurrency) return amount
  const rate = rates.get(fromCurrency)
  if (!rate) return null
  return Math.round(amount / rate)
}

export function summarizeUnconverted(
  items: readonly { currency: string; count?: number }[],
  canConvert: (currency: string) => boolean,
): UnconvertedSummary {
  let count = 0
  const currencies = new Set<string>()
  for (const item of items) {
    if (canConvert(item.currency)) continue
    count += item.count ?? 1
    currencies.add(item.currency)
  }
  return { count, currencies: [...currencies].sort() }
}

export function describeUnconverted(summary: UnconvertedSummary): string | null {
  if (summary.count === 0) return null
  const noun = summary.count === 1 ? 'amount' : 'amounts'
  return `Excludes ${summary.count} ${noun} in ${summary.currencies.join(', ')} — no exchange rate yet`
}
