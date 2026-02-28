# Monthly Burn Rate Card — Design

## Goal

Show the user their normalized monthly burn rate by breaking expenses into three buckets: one-time, monthly recurring, and annual recurring (÷12). The key insight is a single "true monthly cost" number.

## Data Model

Expenses are classified by their panel's `recurrence_type`:

- `null` → one-time
- `'monthly'` → monthly recurring
- `'annual'` → annual recurring, displayed as amount ÷ 12

All amounts are converted to base currency before aggregation.

## Data Flow

Derived from the existing `getDashboardExpenses` query (already joins expenses → panels → categories). No new SQL query needed.

New field on `DashboardStats`:

```ts
interface BurnRate {
  oneTime: number // sum of expenses in non-recurring panels
  monthly: number // sum of expenses in monthly panels
  annualMonthly: number // sum of expenses in annual panels ÷ 12
  annualYearly: number // sum of expenses in annual panels (for annotation)
  total: number // oneTime + monthly + annualMonthly
}
```

Classification is done by looking up each expense's `panel_id` to find its panel's `recurrence_type`. The master query already returns `panel_id` — we need to also include `recurrence_type` in the query (or join via a panel lookup map).

## Card Layout

Placement: between Pancake Stack and Daily Spending.

```
┌─────────────────────────────────────┐
│  Monthly Burn Rate         $1,245   │
│  ███████████░░░░░░████              │
│  One-time   Monthly   Annual/mo     │
│  $450       $620      $175          │
│                        ($2,100/yr)  │
└─────────────────────────────────────┘
```

- Header: "Monthly Burn Rate" + normalized total (bold, neon-cyan)
- Stacked horizontal bar with three color-coded segments:
  - Neon cyan: one-time
  - Neon violet: monthly recurring
  - Neon amber: annual/mo
- Legend row: each bucket's amount
- Annual annotation: `($X/yr)` in muted text next to annual/mo

## Edge Cases

- Card hidden when zero expenses
- Zero-value buckets: no bar segment or legend entry
- Single bucket: full-width bar in that color

## Files to Modify

| File                                            | Change                                                      |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `apps/web/src/db/queries.ts`                    | Add `recurrence_type` to `DashboardExpenseRow`              |
| `apps/web/src/hooks/useDashboardStats.ts`       | Add `burnRate` field, classify expenses by panel recurrence |
| `apps/web/src/views/Dashboard.tsx`              | Render BurnRate card                                        |
| `apps/web/src/hooks/useDashboardStats.test.tsx` | Tests for burn rate computation                             |
