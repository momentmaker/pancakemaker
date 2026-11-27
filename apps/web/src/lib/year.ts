const DAY_MS = 24 * 60 * 60 * 1000

export interface HeatmapDay {
  date: string
  value: number
}

function daysOfYear(year: string): string[] {
  const days: string[] = []
  const start = Date.UTC(Number(year), 0, 1)
  const end = Date.UTC(Number(year) + 1, 0, 1)
  for (let t = start; t < end; t += DAY_MS) days.push(new Date(t).toISOString().slice(0, 10))
  return days
}

export function noSpendStats(
  year: string,
  spentByDay: ReadonlyMap<string, number>,
  today: string,
): { noSpendDays: number; longestStreak: number } {
  let noSpendDays = 0
  let longestStreak = 0
  let streak = 0
  for (const day of daysOfYear(year)) {
    if (day > today) break
    if ((spentByDay.get(day) ?? 0) > 0) {
      streak = 0
      continue
    }
    noSpendDays++
    streak++
    longestStreak = Math.max(longestStreak, streak)
  }
  return { noSpendDays, longestStreak }
}

// Sunday-first weeks, like a contributions graph; null pads the first and
// last week outside the year.
export function heatmapWeeks(
  year: string,
  spentByDay: ReadonlyMap<string, number>,
): (HeatmapDay | null)[][] {
  const days = daysOfYear(year)
  const lead = new Date(days[0] + 'T00:00:00Z').getUTCDay()
  const cells: (HeatmapDay | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...days.map((date) => ({ date, value: spentByDay.get(date) ?? 0 })),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (HeatmapDay | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function intensityLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || max <= 0) return 0
  return Math.max(1, Math.min(4, Math.ceil((value / max) * 4))) as 1 | 2 | 3 | 4
}

export function yearOverYear(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}
