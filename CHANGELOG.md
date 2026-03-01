# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.6.0] - 2026-02-28

### Fixed

- Reduce dashboard DB queries from 8+ to 2 — derive all stats from current + previous month expenses to prevent iOS Safari WASM JIT crash
- Simplify sync engine — remove interval timer, focus handler, and delayed start; sync now only fires after login or CRUD operations

## [1.5.8] - 2026-02-28

### Fixed

- Batch sync pull with yields to prevent iOS Safari WASM JIT crash — process entries in groups of 20 with main-thread yields between batches
- Remove reactive sync triggers from all write paths — sync now fires via 5-min interval, focus event, manual button, or after auth login
- Delay initial sync by 3 seconds to let the app render first
- Detect crash loops (restart within 60s) and defer sync to next interval
- Circuit breaker: disable sync after 3 consecutive failures

## [1.5.7] - 2026-02-28

### Reverted

- Revert all changes from v1.5.2–v1.5.6 (iOS PWA crash fixes) — introduced regressions in regular browser mode

## [1.5.1] - 2026-02-28

### Fixed

- Eliminate PWA white flash, crashes, and sync pressure — switch to prompt-based SW updates, remove hard reload from sync, add focus sync cooldown, prune sync_log, add WASM init retry
- Prevent SparkBars overflow on small screens

## [1.5.0] - 2026-02-28

### Added

- Month navigation with MonthPicker on dashboard
- Month-over-month comparison badge on total spending
- Spending Pace card with projected month-end total and daily average
- Category Trend sparklines with 6-month history and trend arrows
- Monthly Burn Rate card with one-time, monthly, and annual breakdown
- Daily Spending sparkbar chart
- Smart Insights with category deltas, no-spend day count, and biggest spending day
- Year-to-Date summary card with 12-month sparkbars and highest/lightest month
- Biggest Pancake card highlighting the largest expense of the month
- Recent Expenses list with category colors and panel links
- Quick Add expense from dashboard via floating button (mobile) and header button (desktop)
- Multi-currency conversion for all dashboard aggregations
- iOS PWA home screen icon support with generated PNG icons

### Fixed

- Multi-currency totals now correctly convert per-expense before summing
- Race condition guard prevents stale data when navigating months rapidly
- No-spend day count excludes future days in the current month
- Biggest expense scoped to selected month instead of last 10 globally

## [1.4.1] - 2026-02-27

### Fixed

- Remove non-functional recurring toggle from QuickAdd (generator uses panel-level recurrence, not expense-level)

## [1.4.0] - 2026-02-27

### Added

- Trigger sync immediately after expense writes instead of waiting for next poll
- Show pending status immediately after local changes for instant feedback
- Auto-refresh UI when remote sync data arrives (event-driven, no page reload)

### Fixed

- Improve sync reliability with per-table version tracking and granular notifications
- Suppress loading flash on background sync refreshes (only show spinner on navigation)
- Add missing sync triggers to QuickAdd expense handler in RouteView

## [1.3.0] - 2026-02-27

### Added

- Display app version at bottom of Settings page
- "Open Mail App" button on login code entry screen for iOS/Android
- Inline click-to-edit for expense descriptions (Enter/blur saves, Escape cancels)
- "add note" placeholder for expenses without descriptions
- "Stack your expenses. Keep your data." tagline on login page and PWA manifest
- Demo page with 7 viral spending personas at demo.pancakemaker.com
- Subdomain routing for demo.pancakemaker.com

### Changed

- Updated README with tagline, demo link, and reordered features
- Added prettier check requirement before pushing to CLAUDE.md
- Exposed app version via Vite define for build-time injection

## [1.2.0] - 2026-02-27

### Added

- 6-digit verification code for PWA auth — users on iOS can now authenticate entirely within the installed app instead of being redirected to Safari via magic link
- `POST /auth/verify-code` API endpoint with shared verification logic
- Code input UI in Login screen with auto-advance, paste support, and post-auth sync

## [1.1.1] - 2026-02-26

### Fixed

- Reconcile local IDs with server after auth for cross-device sync

## [1.0.0] - 2026-02-26

### Added

- Offline-first expense tracking with in-browser SQLite (wa-sqlite + IndexedDB)
- Dual personal and business expense routes with independent categories and panels
- Color-coded categories with full CRUD and reassign/cascade delete
- Panels with monthly/annual recurrence and archive support
- Recurring expense templates with auto-generation
- Multi-currency tracking with daily exchange rates from Frankfurter API
- Cloud sync via Cloudflare Workers + D1 with magic link authentication
- CSV and JSON export for all expenses
- PWA with offline support and installability
- Dashboard with monthly pancake stack visualization
- SEO meta tags, Open Graph, and Twitter Card support
- OG image with pancake-themed design
- CI pipeline with build, test, and format checks
- CD pipeline triggered by version tags for Cloudflare deployment
- `/release` slash command for semver bumps with changelog generation
- Branch protection requiring CI to pass
- MIT license, README with contributing and self-hosting docs
