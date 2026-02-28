# Dashboard Features B/C/D — Design

## B: Category Trend Sparklines

Show 6-month trend sparklines per top category below the Pancake Stack. Uses existing `getCategoryMonthlyTrend` query. Top 5 categories with mini SparkBars and trend arrow when latest month differs >20% from 6-month average.

## C: Smart Insights

Auto-generated one-liners surfacing patterns: category deltas vs last month, no-spend day count, biggest spending day. Derived from existing data plus per-category previous month totals. Shows top 2-3 most interesting insights.

## D: Year-to-Date Summary

Annual perspective card with YTD total, monthly average, 12-month SparkBars, and best/lightest month labels. New query groups expenses by month for the full year.

## Dashboard Layout Order

Stat cards → Spending Pace → Pancake Stack → Category Trends (B) → Monthly Burn Rate → Daily Spending → Smart Insights (C) → Year to Date (D) → Biggest Pancake → Recent Expenses
