# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
