// Shift a `YYYY-MM` month string by `delta` months (negative goes back). Shared
// by the MonthPicker arrows and the keyboard month-scrub (`[` / `]`).
export function addMonths(month: string, delta: number): string {
  const [year, m] = month.split('-')
  const date = new Date(parseInt(year), parseInt(m) - 1 + delta)
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${mo}`
}
