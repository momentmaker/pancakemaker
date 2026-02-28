# Spending Pace Card — Design

## Goal

Show the user their projected month-end spending based on current pace, compared to last month's actual total. Glanceable, immediately actionable.

## Data Model

All derived from existing `DashboardStats` fields — no new queries.

New fields on `DashboardStats`:

```ts
daysElapsed: number    // today's day-of-month (or full month for past months)
projectedTotal: number // (totalAmount / daysElapsed) * daysInMonth
```

### Projection Formula

```
dailyAverage = totalAmount / daysElapsed
projectedTotal = dailyAverage * daysInMonth
```

For past months (not the current month), `projectedTotal` equals `totalAmount` (no projection needed).

### Reference Target

Last month's total (`prevMonthTotal`), already computed by the hook.

## Card Layout

Placement: between stat cards and Pancake Stack.

```
┌──────────────────────────────────────────┐
│  Spending Pace                           │
│                                          │
│  ████████████░░░░░░░░░░░░│              │
│  $1,245 spent    projected: $2,340       │
│                           ↑              │
│                      last month: $1,890  │
│                                          │
│  Day 15 of 28  ·  ~$83/day              │
└──────────────────────────────────────────┘
```

- Progress bar: solid fill for actual, translucent extension for projected remainder
- Vertical tick mark on bar shows last month's total position
- Primary number: projected total — neon-cyan if under last month, neon-orange if over
- Secondary line: days elapsed / total + daily average
- Past months: show actual total only, no projection or progress bar

## Color Logic

- Projected under last month: neon-cyan
- Projected over last month: neon-orange
- No previous month data: text-secondary (neutral)

## Edge Cases

- First day of month (day 1): show "Not enough data yet" instead of projection
- No previous month data: hide last-month marker, show projected total in neutral color
- Past month (not current): show actual total, no projection bar
- Zero spending: hide card entirely

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/hooks/useDashboardStats.ts` | Add `daysElapsed` and `projectedTotal` to `DashboardStats` |
| `apps/web/src/views/Dashboard.tsx` | New `SpendingPaceCard` component between stat cards and PancakeStack |
| `apps/web/src/hooks/useDashboardStats.test.tsx` | Tests for projection logic |
