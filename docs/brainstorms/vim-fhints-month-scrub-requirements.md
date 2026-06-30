---
date: 2026-06-30
topic: vim-fhints-month-scrub
---

# Vim f-hints + Month Scrub (Phase 4)

## Summary

Two desktop-only keyboard features completing the vim shortcut suite for pancakemaker. **f-hints:** press `f` to overlay single-letter badges on the visible navigable/actionable targets (nav links, cards, expense rows, primary action buttons); typing a target's letter activates it (navigate / open / edit / click) and exits; a mistype or `Esc` exits silently. **Month scrub:** `[` / `]` move the current view's month back/forward, driving the existing month picker. Both build on the Phase 1 engine (intent-mapper, desktop gate, cursor system, overlay/field stand-down) and coexist with Phase 2 capture and Phase 3 palette.

Realizes R20–R21 of the origin roadmap and resolves the f-hint target-set question it deferred (see origin: [docs/brainstorms/vim-keyboard-shortcuts-requirements.md](docs/brainstorms/vim-keyboard-shortcuts-requirements.md), R20–R21; roadmap [docs/plans/2026-06-26-vim-keyboard-shortcuts-plan.md](docs/plans/2026-06-26-vim-keyboard-shortcuts-plan.md), unit U9).

---

## Problem Frame

Phases 1–3 gave sequential list navigation (`j`/`k`), fast capture (`a`/`:`), and a fuzzy palette (`Cmd-K`). Two keyboard gaps remain for a mouse-free power user: **reaching a specific visible target directly** (rather than `j`/`k`-ing to it or mousing) and **changing the month** without reaching for the picker arrows. f-hints (the proven `ypuf` pattern) give a one-or-two-keystroke jump to anything on screen; `[`/`]` make month navigation a reflex. Both are additive on the existing engine and must stand down cleanly when a field, modal, palette, or capture bar owns the keyboard.

---

## Key Flows

- F1. f-hint jump
  - **Trigger:** User presses `f`.
  - **Steps:** Single-letter badges appear on every visible target → user types a target's letter → that target is activated (nav navigates, card/row opens, button clicks) and f-mode exits.
  - **Outcome:** Direct jump to any visible target, mouse-free. A keystroke matching no badge, or `Esc`, exits silently with nothing activated.
  - **Covered by:** R1, R2, R3, R4, R5

- F2. Month scrub
  - **Trigger:** On a view with a month picker, user presses `]` (next) or `[` (previous).
  - **Steps:** The view's month state moves one month, re-driving its month picker and data.
  - **Outcome:** Fast month navigation; a no-op on views without a picker.
  - **Covered by:** R7, R8

---

## Requirements

**f-hint mode**

- R1. `f` enters f-hint mode from anywhere shortcuts are active, overlaying single-letter badges on visible targets. It registers on the Phase 1 intent-mapper.
- R2. Badged targets are: nav links (routes), cards (category & panel), expense rows, and primary action buttons (add / create / export). Utility chrome (sync indicator, install, GitHub link) is never badged.
- R3. Labels are single letters from a home-row-first pool (`a s d f g h j k l`, then the remaining letters). Only currently-visible (in-viewport) targets are badged; if visible targets exceed the label pool, the overflow is left unbadged for that activation.
- R4. Typing a badged letter activates that target and exits f-mode: a nav link navigates; a card opens its detail view; an expense row opens/edits it (the same effect as the cursor's `open`); a button is clicked.
- R5. f-mode is a transient overlay (badges only, no dimming scrim) that captures keystrokes while active — other shortcuts are suspended until it exits. A keystroke matching no badge, or `Esc`, exits f-mode silently with no activation.
- R6. `f` is desktop-only and stands down while a field is focused or a modal / palette / `:` capture bar owns the keyboard (inherits the Phase 1 guards).

**Month scrub**

- R7. `[` / `]` move the current view's month to the previous / next month, driving the existing `MonthPicker` state, on views that have a month picker (Dashboard, the Personal/Business route views, category detail, panel detail).
- R8. Month scrub is unbounded (matches the existing picker arrows, including future months) and is a silent no-op on views without a month picker (e.g., Settings).
- R9. `[` / `]` are desktop-only, stand down in fields/overlays (inherit the Phase 1 guards), and register on the intent-mapper.

---

## Acceptance Examples

- AE1. **Covers R1, R3, R4.** On a route view, pressing `f` badges each visible category/panel card with a letter; typing that letter opens the card's detail view and clears the badges.
- AE2. **Covers R4.** On a category detail view, pressing `f` badges the visible expense rows; typing a row's letter opens/edits that row.
- AE3. **Covers R2, R4.** Pressing `f` badges the nav links; typing Personal's letter navigates to `/personal`.
- AE4. **Covers R5.** Pressing `f` then a key matching no badge dismisses the badges with no action; `Esc` does the same.
- AE5. **Covers R2.** The sync indicator, install button, and GitHub link never receive a badge.
- AE6. **Covers R7.** On a category detail showing June, pressing `]` shows July and `[` returns to June, exactly as the month-picker arrows would.
- AE7. **Covers R8.** On Settings (no month picker), `[` and `]` do nothing.
- AE8. **Covers R6, R9.** While a text field is focused, or the command palette / `:` bar / a modal is open, `f`, `[`, and `]` do nothing.

---

## Success Criteria

- A keyboard user can jump to any visible nav link, card, expense row, or primary action with `f` + one letter, mouse-free, and change months with `[` / `]` — without ever leaving the home row.
- f-hint mode never leaves the UI in a stuck state: every exit (activation, mistype, `Esc`) restores normal shortcut handling.
- Both features are additive on Phases 1–3 and do not regress the cursor, capture, palette, or any field/overlay stand-down behavior.
- `ce-plan` can implement without inventing the target set, label scheme, activation semantics, or month-scrub scope.

---

## Scope Boundaries

### Deferred for later

- Multi-letter hint sequences (home-row pairs) for views with more visible targets than the single-letter pool — single-letter + viewport-only is the chosen scope.
- Hinting off-screen or virtualized targets — only in-viewport targets are badged.
- A background dimming scrim or animated hint reveal — badges only.
- Month-scrub bounds (e.g., clamping future months) — scrub is unbounded to match the picker.

### Outside this product's identity

- Mobile/touch — inherits the Phase 1 desktop-only gate.
- Demo-persona parity — deferred alongside Phases 1–3.
- f-hints over utility chrome (sync/install/GitHub) or browser UI.

---

## Key Decisions

- **f activates the target (ypuf-style), not just moves the cursor.** Typing a label navigates/opens/edits/clicks directly. `f` is the direct-jump path; the cursor (`j`/`k`) remains the sequential-nav path. For cards/rows the two overlap, which is acceptable.
- **Broad target set: nav links + cards + expense rows + primary action buttons.** Utility chrome is excluded. This maximizes "teleport anywhere" while keeping badges meaningful.
- **Single-letter, viewport-only labels (home-row first).** Simplest scheme that matches "visible targets"; overflow beyond the label pool is unbadged that round rather than escalating to multi-letter sequences.
- **f-mode is transient and key-capturing**, exiting on activation, mistype, or `Esc` — silent on the non-activating exits.
- **Month scrub drives the existing per-view `MonthPicker`** on the four views that have one, unbounded, no-op elsewhere.

---

## Dependencies / Assumptions

- Depends on Phase 1 (intent-mapper, `useIsDesktop` gate, `isBlockingOverlayOpen` overlay/field stand-down, the cursor system and `data-kbd-item-id` markers on `Card`/`ExpenseRow`) and coexists with Phase 2 (capture) and Phase 3 (palette) — all on `feat/vim-keyboard-shortcuts`.
- The `MonthPicker` component (`{ month, onChange }`, `addMonths ±1`) is used in Dashboard, `RouteView`, `CategoryDetail`, and `PanelDetail`, each owning its own `month` state. There is no shared month context today, so month scrub needs a mechanism for the global keyboard layer to reach the current view's month (the cursor provider is the model — resolved during planning).
- `data-kbd-item-id` already marks `Card` and `ExpenseRow`; nav links and primary action buttons are not yet marked as hint targets, so a discovery/marking mechanism is required (resolved during planning).
- Assumes the number of visible targets on any view typically fits the single-letter pool; the overflow case is rare and degrades gracefully (unbadged).

---

## Outstanding Questions

### Resolve Before Planning

- None — the product decisions (target set, activation semantics, label scheme, month-scrub scope, coexistence) are settled above.

### Deferred to Planning

- [Affects R2, R3][Technical] Hint-target discovery — a marker attribute (extending `data-kbd-item-id` to nav links / buttons) vs a live DOM query of visible focusable/clickable elements, and how "visible/in-viewport" is determined given React rendering.
- [Affects R3][Technical] Label-pool definition and assignment order (home-row first), and how labels map to targets deterministically across re-renders.
- [Affects R7][Technical] Month-scrub mechanism — how the global keyboard layer reaches the active view's `setMonth` (a registration/context mirroring `KeyboardCursorProvider`, or per-view wiring).
- [Affects R4] Exact "primary action buttons" set to badge (add expense, New Panel, export, …) vs leaving some out.
