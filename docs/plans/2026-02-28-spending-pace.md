# Spending Pace Card Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show projected month-end spending based on current pace, compared to last month's total.

**Architecture:** Add `daysElapsed` and `projectedTotal` fields to `DashboardStats` (computed in the hook from existing data). Render a new `SpendingPaceCard` component in Dashboard.tsx between the stat cards and PancakeStack.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest

---

### Task 1: Add pace fields to DashboardStats and compute them

**Files:**
- Modify: `apps/web/src/hooks/useDashboardStats.ts:27-38` (interface) and `:152-200` (hook body)

**Step 1: Write the failing tests**

Add to `apps/web/src/hooks/useDashboardStats.test.tsx`, at the end of the `useDashboardStats` describe block (before the closing `})`):

```typescript
  it('computes projectedTotal for mid-month', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const cat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)
    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 10000,
      currency: 'USD',
      date: '2026-01-10',
    })
    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 5000,
      currency: 'USD',
      date: '2026-01-15',
    })

    // #when — passing daysElapsed=15 means $15000 over 15 days => $1000/day => $31000 projected
    const { result } = renderHook(() => useDashboardStats('2026-01', 15), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.daysElapsed).toBe(15)
    expect(result.current.stats!.projectedTotal).toBe(31000)
  })

  it('projectedTotal equals totalAmount for completed months', async () => {
    // #given
    const panel = await createPanel(db, personalRouteId, 'Daily', 'USD', 0)
    const cat = await createCategory(db, personalRouteId, 'Food', '#ff0000', 0)
    await createExpense(db, {
      panelId: panel.id,
      categoryId: cat.id,
      amount: 5000,
      currency: 'USD',
      date: '2025-11-10',
    })

    // #when — daysElapsed omitted, Nov 2025 is in the past so full month
    const { result } = renderHook(() => useDashboardStats('2025-11'), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.daysElapsed).toBe(30)
    expect(result.current.stats!.projectedTotal).toBe(5000)
  })

  it('projectedTotal is null when daysElapsed is less than 2', async () => {
    // #given — no expenses

    // #when — day 1 of month
    const { result } = renderHook(() => useDashboardStats('2026-03', 1), { wrapper })
    await act(async () => {})

    // #then
    expect(result.current.stats!.daysElapsed).toBe(1)
    expect(result.current.stats!.projectedTotal).toBeNull()
  })
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/hooks/useDashboardStats.test.tsx`
Expected: 3 failures — `useDashboardStats` doesn't accept a second argument, `daysElapsed` and `projectedTotal` don't exist on stats.

**Step 3: Implement the changes**

In `apps/web/src/hooks/useDashboardStats.ts`:

1. Add fields to `DashboardStats` interface (after line 37):

```typescript
  daysElapsed: number
  projectedTotal: number | null
```

2. Add a helper function (after the `daysInMonth` function, around line 51):

```typescript
function computeDaysElapsed(month: string, override?: number): number {
  if (override !== undefined) return override
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (month === currentMonth) return now.getDate()
  if (month < currentMonth) return daysInMonth(month)
  return 0
}
```

3. Update function signature (line 152):

```typescript
export function useDashboardStats(month: string, daysElapsedOverride?: number) {
```

4. Inside `loadStats` (after `const burnRate = ...` around line 179), add:

```typescript
      const elapsed = computeDaysElapsed(month, daysElapsedOverride)
      const days = daysInMonth(month)
      const projectedTotal =
        elapsed >= 2 ? Math.round((current.totalAmount / elapsed) * days) : null
```

5. Add to `setStats` call (around line 188):

```typescript
        daysElapsed: elapsed,
        projectedTotal,
```

6. Add `daysElapsedOverride` to the `useCallback` dependency array (line 200).

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/hooks/useDashboardStats.test.tsx`
Expected: All tests pass (16 existing + 3 new = 19 total).

**Step 5: Run prettier**

Run: `cd apps/web && npx prettier --write src/hooks/useDashboardStats.ts src/hooks/useDashboardStats.test.tsx`

**Step 6: Commit**

```bash
git add apps/web/src/hooks/useDashboardStats.ts apps/web/src/hooks/useDashboardStats.test.tsx
git commit -m "feat: add spending pace projection to dashboard stats"
```

---

### Task 2: Build SpendingPaceCard component

**Files:**
- Modify: `apps/web/src/views/Dashboard.tsx:7` (import), `:302-670` (component body)

**Step 1: Add the SpendingPaceCard component**

In `apps/web/src/views/Dashboard.tsx`, add after the `BurnRateCard` function (around line 300):

```typescript
function SpendingPaceCard({
  totalAmount,
  projectedTotal,
  prevMonthTotal,
  daysElapsed,
  daysInMonth,
  currency,
}: {
  totalAmount: number
  projectedTotal: number
  prevMonthTotal: number | null
  daysElapsed: number
  daysInMonth: number
  currency: string
}) {
  const dailyAverage = Math.round(totalAmount / daysElapsed)
  const actualPct = Math.min((totalAmount / (projectedTotal || 1)) * 100, 100)
  const isOver = prevMonthTotal !== null && projectedTotal > prevMonthTotal
  const isUnder = prevMonthTotal !== null && projectedTotal <= prevMonthTotal
  const projectedColor = isOver ? 'text-neon-orange' : isUnder ? 'text-neon-cyan' : 'text-text-secondary'

  const prevPct =
    prevMonthTotal !== null && projectedTotal > 0
      ? Math.min((prevMonthTotal / Math.max(projectedTotal, prevMonthTotal)) * 100, 100)
      : null

  return (
    <Card className="mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono text-sm font-semibold text-text-secondary">Spending Pace</h2>
        <div className={`font-mono ${projectedColor}`}>
          <AmountDisplay amount={projectedTotal} currency={currency} size="md" />
        </div>
      </div>

      <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-bg-primary/50">
        <div
          className="h-full rounded-full bg-neon-cyan/70 transition-all duration-500"
          style={{ width: `${actualPct}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-neon-cyan/20"
          style={{ width: '100%' }}
        />
        {prevPct !== null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-text-muted/60"
            style={{ left: `${prevPct}%` }}
            title="Last month"
          />
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3 font-mono text-xs text-text-muted">
          <span>
            Day {daysElapsed} of {daysInMonth}
          </span>
          <span>·</span>
          <span>
            ~<AmountDisplay amount={dailyAverage} currency={currency} size="sm" />
            /day
          </span>
        </div>
        {prevMonthTotal !== null && (
          <span className="font-mono text-[10px] text-text-muted">
            last month: <AmountDisplay amount={prevMonthTotal} currency={currency} size="sm" />
          </span>
        )}
      </div>
    </Card>
  )
}
```

**Step 2: Import `daysInMonth` helper (or inline it)**

The `daysInMonth` function lives in `useDashboardStats.ts` but isn't exported. Rather than export it, compute days from `stats.dayBreakdown.length` which already equals the days in the month.

**Step 3: Wire SpendingPaceCard into the Dashboard render**

In the Dashboard component's JSX, after the stat cards `</div>` (around line 456) and before the PancakeStack section, add:

```tsx
          {/* Spending Pace */}
          {stats.projectedTotal !== null && stats.totalAmount > 0 && (
            <SpendingPaceCard
              totalAmount={stats.totalAmount}
              projectedTotal={stats.projectedTotal}
              prevMonthTotal={stats.prevMonthTotal}
              daysElapsed={stats.daysElapsed}
              daysInMonth={stats.dayBreakdown.length}
              currency={baseCurrency}
            />
          )}
```

**Step 4: Verify in browser**

Run: dev server should already be running at localhost:5173
Check: Navigate to Dashboard, confirm the Spending Pace card appears between stat cards and PancakeStack with correct data.

**Step 5: Run all tests**

Run: `cd apps/web && npx vitest run`
Expected: All tests pass.

**Step 6: Run prettier**

Run: `cd apps/web && npx prettier --write src/views/Dashboard.tsx`

**Step 7: Commit**

```bash
git add apps/web/src/views/Dashboard.tsx
git commit -m "feat: add Spending Pace card to dashboard"
```
