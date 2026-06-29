---
date: 2026-06-29
topic: vim-fast-capture
---

# Vim Fast Capture (Phase 2)

## Summary

Two desktop fast-capture keyboard bindings for pancakemaker: `a` opens the existing QuickAdd instantly (amount autofocused), and `:` opens a command-line bar parsing `:<amount> <note> [#category]` that creates an expense in one shot when the category resolves unambiguously and pre-fills QuickAdd when it can't. Date is always today; the target route is shown, and a confirmation appears after a one-shot create.

---

## Problem Frame

The highest-frequency action in an expense tracker is logging an expense, and today it always costs a click into "Add Expense" and a multi-field modal. Phase 1 made the app keyboard-navigable; Phase 2 attacks the capture cost itself — turning "log $12.50 for coffee" into a few keystrokes from anywhere, without the mouse. The risk to manage is that a too-clever one-shot capture silently files an expense into the wrong route/category; the design must make speed safe.

This resolves the Phase 2 open questions deferred by the Phase 1 plan (see origin: [docs/plans/2026-06-26-vim-keyboard-shortcuts-plan.md](docs/plans/2026-06-26-vim-keyboard-shortcuts-plan.md), unit U7).

---

## Key Flows

- F1. One-shot capture (`:` with a category)
  - **Trigger:** User presses `:`, types `12.50 coffee #food`, presses Enter.
  - **Steps:** Bar parses amount + note + `#category` → resolves the category against the target route → creates the expense (target route, default panel, matched category, today) → shows a confirmation.
  - **Outcome:** Expense logged in one keystroke sequence; `Esc` at any point cancels the bar with nothing created.
  - **Covered by:** R2, R6, R7, R8, R10

- F2. Prefill capture (`a`, or `:` that can't fully resolve)
  - **Trigger:** User presses `a`; or presses `:` and types `12.50 coffee` (no/ambiguous category).
  - **Steps:** QuickAdd opens — blank with amount focused for `a`; pre-filled with the parsed amount + note and focused on the Category picker for `:`. User completes and saves.
  - **Outcome:** A fast front door to QuickAdd; nothing is created until the user confirms.
  - **Covered by:** R1, R9

---

## Requirements

**Capture entry**
- R1. `a` opens QuickAdd immediately with the amount autofocused, from anywhere shortcuts are active (including the Dashboard).
- R2. `:` opens a single-line command-line capture bar, from anywhere shortcuts are active.
- R3. Both bindings are desktop-only and stand down while a modal/dialog owns the keyboard (inherit the Phase 1 guards), and both register into the Phase 1 intent-mapper.

**Capture target**
- R4. On a Personal/Business route or its detail views, captures target that route. With no route context (Dashboard/Settings), captures target the **Personal** route.
- R5. The resolved target route is visible in the capture UI (QuickAdd and the `:` bar).
- R6. Captures use the target route's default panel (`is_default`) and that panel's currency; the date is today.

**`:` grammar and resolution**
- R7. The `:` bar parses `:<amount> <note...> [#category]` — a leading decimal amount, free-text note, and an optional trailing `#category` token.
- R8. `#category` matches case-insensitively by prefix against the target route's categories: exactly one match resolves; zero or multiple is unresolved.
- R9. When the amount is valid AND a category resolves AND a default panel exists, the `:` bar creates the expense in one shot (target route, default panel, matched category, parsed note, today).
- R10. Otherwise — invalid/missing amount, missing/ambiguous/unmatched category, or no default panel — the `:` bar opens QuickAdd pre-filled with whatever parsed cleanly (amount, note), focused on the Category picker. Nothing is created until the user confirms.

**Confirmation**
- R11. After a one-shot `:` create, a confirmation surfaces showing where it landed (route · category · amount).

---

## Acceptance Examples

- AE1. **Covers R9.** Given the `/personal` route has a "Food" category and a default panel, when the user presses `:` and enters `12.50 coffee #food`, one expense is created (Personal, default panel, Food, today, $12.50, note "coffee").
- AE2. **Covers R10.** Given any route, when the user enters `:12.50 coffee` (no `#category`), QuickAdd opens pre-filled with amount 12.50 and note "coffee", focused on Category; no expense is created yet.
- AE3. **Covers R8, R10.** Given categories "Food" and "Fitness", when the user enters `:12.50 lunch #f`, the match is ambiguous, so QuickAdd opens pre-filled (not created).
- AE4. **Covers R4, R1.** Given the user is on the Dashboard, when they press `a`, QuickAdd opens targeting the Personal route with the amount focused.
- AE5. **Covers R10.** When the user enters `:coffee` (no amount), QuickAdd opens pre-filled with the note and no amount; nothing is created.
- AE6. **Covers R11.** After the one-shot create in AE1, a confirmation shows "Personal · Food · $12.50".

---

## Success Criteria

- A keyboard user can log a categorized expense from anywhere in a couple of seconds via `:`, mouse-free.
- Capture never silently creates a mis-filed or wrong expense — every uncertain case routes to a visible QuickAdd prefill.
- The feature is additive on Phase 1 (intent-mapper, desktop gate, modal stand-down) and does not regress existing QuickAdd/mouse flows.
- `ce-plan` can implement without inventing parse rules, target resolution, or fallback behavior.

---

## Scope Boundaries

- Date tokens (`@yesterday`, `@6-20`) and panel tokens (`/panel`) — deferred; capture is today-only into the default panel.
- Undo on the confirmation — deferred; mistakes are deletable via the Phase 1 `d` action.
- Last-used-route memory — deferred; no-context captures default to Personal.
- Editing existing expenses or setting recurrence via capture — out of scope.
- Multi-expense / batch capture in one line — out of scope.
- Mobile/touch — inherits Phase 1 desktop-only gating.

---

## Key Decisions

- **Speed is gated on certainty:** one-shot create fires only when amount + category + default panel all resolve unambiguously; every uncertain case falls back to a visible QuickAdd prefill rather than guessing.
- **No-context route = Personal**, with the target route shown and a post-create confirmation — chosen over last-used-route for predictability in an immediate-create flow.
- **`#category` matching = case-insensitive prefix, single-match-creates** (zero or multiple → prefill).
- **`a` reuses the existing QuickAdd**; `:` is a new lightweight command bar. Both are new bindings on the Phase 1 intent-mapper.

---

## Dependencies / Assumptions

- Depends on Phase 1 (intent-mapper, `useIsDesktop` gate, modal/popover stand-down), which has landed on `feat/vim-keyboard-shortcuts`.
- QuickAdd's open-state is per-view today; a global open mechanism is required (resolved during planning).
- No general toast/notification surface exists (only `apps/web/src/components/UpdateBanner.tsx`); the post-create confirmation needs a small new surface or inline indicator (designed during planning).
- Assumes each route has a default panel (`is_default`) and at least one category for a one-shot create to fire; absent either, the flow falls back to prefill.

---

## Outstanding Questions

### Resolve Before Planning

- None — the product decisions (grammar, target, fallback, confirmation) are settled above.

### Deferred to Planning

- [Affects R1][Technical] Global QuickAdd open mechanism — lift open-state to the app shell vs. a small context/provider.
- [Affects R11][Needs design] Confirmation surface — a minimal toast component vs. an inline indicator near the nav.
- [Affects R7][Technical] Parser edge cases — amount formats (`$`, thousands separators, `12.5` vs `12.50`), notes containing `#`, multiple/trailing `#` tokens.
