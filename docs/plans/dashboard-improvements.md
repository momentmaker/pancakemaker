# Dashboard Improvements

Ideas for making the home screen useful for daily expense tracking.

## Quick Add from Dashboard

The Dashboard has no way to add an expense — users must navigate to a panel first. Add a floating "+" button (same pattern already used on PanelDetail/CategoryDetail mobile views) that opens QuickAdd with panel/category selection.

## Recent Expenses

Show the last 5-10 expenses below the PancakeStack so users can verify their latest entries without navigating away. Each row should link through to the expense's panel.

## Month-over-Month Comparison

The Dashboard only shows the current month with no context. Add a comparison indicator next to the total — something like "+12% vs last month" or "-$200 vs last month" to give users instant spending trajectory awareness.

## Month Navigation

The Dashboard is locked to the current calendar month with no way to change it. Add a MonthPicker (already exists as a component used in PanelDetail/CategoryDetail) so users can review past months.

## Fix Multi-Currency Dashboard Totals

Dashboard sums raw `amount` values without currency conversion — amounts from different-currency panels are summed as if they're the same currency. CategoryDetail already uses `useExchangeRates.convert()` correctly. Dashboard should do the same.

## Day-of-Month Breakdown

A simple bar chart or heatmap showing which days had spending and how much. Helps users spot patterns (e.g., weekend spending spikes).

## Biggest Expense Callout

Surface the single largest expense of the month as a highlighted card — useful for catching outliers or remembering large purchases.
