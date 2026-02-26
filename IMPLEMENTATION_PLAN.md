# Pancakemaker Implementation Plan

## Stage 1: Project Scaffolding
**Goal**: Monorepo with React+Vite frontend, Hono worker, shared types package, all building and testing
**Success Criteria**: `turbo build` succeeds, `turbo test` runs, dev servers start, routes render
**Tests**: Build passes, Vitest runs, dev server serves routes
**Status**: Complete

## Stage 2: Local Data Layer
**Goal**: wa-sqlite with OPFS, migrations, CRUD hooks, seeded categories
**Success Criteria**: All tables created, CRUD operations work, default categories seeded
**Tests**: Unit tests for DB queries, CRUD hooks, migration runner
**Status**: Complete

## Stage 3: Core UI
**Goal**: Dashboard, route views, panel detail, quick add modal, settings
**Success Criteria**: All views render, navigation works, expense CRUD via UI
**Tests**: Component render tests, navigation tests
**Status**: Complete

## Stage 4: Auth & Server
**Goal**: D1 schema, magic link auth, Worker API routes, currency caching
**Success Criteria**: Auth flow works, API returns data, rates cached
**Tests**: API route tests, auth flow tests
**Status**: Complete

## Stage 5: Sync Engine
**Goal**: sync_log tracking, push/pull, conflict resolution, status indicator
**Success Criteria**: Offline CRUD syncs on reconnect, conflicts resolved
**Tests**: Sync logic unit tests, conflict resolution tests
**Status**: Complete

## Stage 6: Polish & Export
**Goal**: CSV/JSON export, PWA service worker, responsive design, error handling
**Success Criteria**: Export works, PWA installable, responsive on mobile
**Tests**: Export format tests, offline tests
**Status**: Complete

## Stage 7: Category-First Schema Migration + Types + Queries
**Goal**: Add recurring_templates table, modify expenses/panels, update types and queries
**Success Criteria**: Migration runs, new queries have tests, shared types compile
**Status**: Complete

## Stage 8: Recurring Generation Engine + Hook Updates
**Goal**: Build recurring expense auto-generation logic and update hooks
**Success Criteria**: Date calculation works, generation is idempotent, useExpenses loads by category
**Status**: Complete

## Stage 9: Routing + Route View Redesign
**Goal**: New URL structure, tabbed route view, category cards, month picker
**Success Criteria**: Tab switching, category totals, month picker, panel URL redirects
**Status**: Complete

## Stage 10: CategoryDetail View + QuickAdd Redesign
**Goal**: Full CategoryDetail with expenses grouped by panel, context-aware QuickAdd
**Success Criteria**: Grouped expenses, recurring badge, locked category, panel memory
**Status**: Not Started

## Stage 11: Recurring Edit/Skip + Panel Management + Polish
**Goal**: Recurring editing flow, panel management, currency conversion
**Success Criteria**: Two save modes, skip works, panel archive, converted totals
**Status**: Not Started
