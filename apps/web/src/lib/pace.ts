export function cumulative(daily: readonly number[]): number[] {
  let running = 0
  return daily.map((value) => (running += value))
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

// The "ghost" is a typical month: for each day, the median running total of
// past months. Comparing against a curve (not a straight line) keeps a rent
// payment on day 1 from looking like a runaway month.
export function ghostCurve(pastCurves: readonly number[][], length: number): number[] | null {
  const curves = pastCurves.filter((c) => c.length > 0)
  if (curves.length === 0) return null
  return Array.from({ length }, (_, day) =>
    median(curves.map((c) => c[Math.min(day, c.length - 1)])),
  )
}

export interface MonthEndInput {
  spentSoFar: number
  recurringSpentSoFar: number
  upcomingRecurring: number
  daysElapsed: number
  daysInMonth: number
}

// Recurring charges are lumps on known days, so only everyday spending is
// extrapolated; known bills still to come are added as they are.
export function projectMonthEnd({
  spentSoFar,
  recurringSpentSoFar,
  upcomingRecurring,
  daysElapsed,
  daysInMonth,
}: MonthEndInput): number | null {
  if (daysElapsed >= daysInMonth) return spentSoFar
  if (daysElapsed < 2) return null
  const everydayRate = (spentSoFar - recurringSpentSoFar) / daysElapsed
  return Math.round(spentSoFar + upcomingRecurring + everydayRate * (daysInMonth - daysElapsed))
}

export function ghostDelta(
  current: readonly number[],
  ghost: readonly number[] | null,
  day: number,
): number | null {
  if (!ghost || day < 1 || day > current.length) return null
  return current[day - 1] - ghost[Math.min(day, ghost.length) - 1]
}
