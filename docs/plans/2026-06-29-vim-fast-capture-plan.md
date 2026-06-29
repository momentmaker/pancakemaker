---
title: 'feat: Vim fast capture (Phase 2)'
type: feat
status: active
date: 2026-06-29
origin: docs/brainstorms/vim-fast-capture-requirements.md
---

# feat: Vim fast capture (Phase 2)

## Summary

Add two desktop fast-capture bindings on top of the Phase 1 keyboard engine: `a` opens a route-resolved QuickAdd instantly, and `:` opens a command bar that parses `:<amount> <note> [#category]` and either creates an expense in one shot (when amount + category + default panel all resolve) or pre-fills QuickAdd otherwise. A pure parser/resolver module backs `:`; a `CaptureProvider` mounted in the app shell owns the capture UI and route resolution; a minimal auto-dismiss toast confirms one-shot creates. Realizes unit U7 of the multi-phase plan (see origin: [docs/plans/2026-06-26-vim-keyboard-shortcuts-plan.md](docs/plans/2026-06-26-vim-keyboard-shortcuts-plan.md)).

---

## Problem Frame

Logging an expense is the highest-frequency action in the app and still costs a click into "Add Expense" plus a multi-field modal. Phase 1 made the app keyboard-navigable; Phase 2 attacks capture cost itself — `a` for an instant modal and `:` for a one-keystroke-sequence log — while keeping speed safe (uncertain captures never silently mis-file). Product decisions are settled in the origin requirements doc; this plan resolves the three deferred technical questions (global QuickAdd mechanism, confirmation surface, parser rules).

---

## Requirements

(Origin R-IDs from [docs/brainstorms/vim-fast-capture-requirements.md](docs/brainstorms/vim-fast-capture-requirements.md).)

- R1. `a` opens QuickAdd immediately, amount autofocused, from anywhere (incl. Dashboard).
- R2. `:` opens a single-line command-line capture bar from anywhere.
- R3. Both are desktop-only, stand down while a modal owns the keyboard, and register on the Phase 1 intent-mapper.
- R4. Target route = current route, else Personal (no-context).
- R5. The target route is visible in the capture UI.
- R6. Captures use the target route's default panel + that panel's currency; date is today.
- R7. `:` parses `:<amount> <note...> [#category]`.
- R8. `#category` matches case-insensitively by prefix **against the target route's categories**; exactly one match resolves, zero/multiple is unresolved.
- R9. Amount valid + category resolved + default panel exists → one-shot create.
- R10. Otherwise → open QuickAdd pre-filled with what parsed, **carrying the unresolved `#category` token forward** (seed the category picker's search / show it) so the user sees why it didn't one-shot; focus the category picker; nothing created until confirmed.
- R11. After a one-shot create, a confirmation shows route · category · amount.

**Origin acceptance examples:** AE1 (covers R9), AE2 (R10), AE3 (R8/R10), AE4 (R4/R1), AE5 (R10), AE6 (R11).

---

## Scope Boundaries

- Date tokens (`@date`) and panel tokens (`/panel`) — out; today + default panel only.
- Undo on the confirmation — out; mistakes are deletable via the Phase 1 `d` action.
- Last-used-route memory — out; no-context defaults to Personal.
- Editing existing expenses or recurrence via capture — out.
- Mobile/touch — inherits Phase 1 desktop-only gating.

### Deferred to Follow-Up Work

- Demo-persona parity for capture (the provider mounts in `Layout`, not `demo-layout.tsx`) — deferred alongside Phase 1's demo deferral.

---

## Context & Research

### Relevant Code and Patterns

- **QuickAdd** (`apps/web/src/components/QuickAdd.tsx`): controlled (`open`/`onClose`), takes `categories`, `panels`, `onAdd`. Already resolves the panel from the **selected category's route** via `pickDefaultPanel(panels, category.route_id)` and supports categories spanning both routes (`showRouteMarkers`, `personalRouteId`). Amount is `autoFocus`. A route-resolved global instance is a wiring problem, not a rewrite.
- **App shell**: `apps/web/src/main.tsx` → `App` → `Layout`. The Phase 1 `useKeyboardShortcuts` hook and `KeyboardCursorProvider` already mount in `apps/web/src/components/Layout.tsx` — the same place a `CaptureProvider` mounts, and it has DB/router/app-state context.
- **Create + sync sequence**: `RouteView.handleAddExpense` (`apps/web/src/views/RouteView.tsx`) — `createExpense` → `logSyncEntry` → `markPending` → `triggerSync`. Capture reuses this exact path; no new data path.
- **Intent-mapper + dispatch**: `apps/web/src/lib/keyboard/intents.ts` (`SINGLE_KEYS` Map, `KeyAction` union) and `apps/web/src/hooks/useKeyboardShortcuts.ts` (the exhaustive `dispatch` switch — a new `KeyAction` is a compile error until wired). `apps/web/src/hooks/useKeyboardCursor.tsx` is the template for a Layout-mounted context the hook consumes.
- **Cheatsheet**: `apps/web/src/lib/keyboard/bindings.ts` (`KEYBOARD_BINDINGS`).
- **Timer pattern** for the toast: `ExpenseRow`'s 3s confirm timer; `UpdateBanner.tsx` for a fixed-position banner style.

### Institutional Learnings

- No `docs/solutions/` store exists. Relevant CHANGELOG learning: heavy synchronous work in event handlers crashed iOS Safari (v1.5.x) — keep the keydown path lightweight; capture's DB writes happen in the provider's async `onAdd`, not inside the keydown handler.

### External References

- None — known stack (React 19), strong local patterns (QuickAdd, the Phase 1 engine).

---

## Key Technical Decisions

- **Capture lives in a `CaptureProvider` mounted in `Layout`**, consumed by `useKeyboardShortcuts` exactly like `KeyboardCursorProvider` — the hook dispatches `a`/`:` to it.
- **Global capture renders its own route-resolved QuickAdd instance**; the per-view QuickAdds (with their locked-category / fixed-panel context) stay for their mouse buttons. Both are `<dialog>` Modals, so only one is open at a time, and the Phase 1 guard prevents `a`/`:` from firing while any modal is open.
- **`:` parse rules**: amount = first whitespace token (strip a leading `$`; `parseFloat`, reject `NaN`/≤0); `#category` = the **trailing** token only when it starts with `#` (notes may contain `#` freely otherwise); note = the tokens between. Resolution = case-insensitive prefix, single-match resolves.
- **One-shot create only when amount + category + default panel all resolve**; every other case falls back to a pre-filled QuickAdd (safety over speed).
- **Confirmation = a minimal auto-dismiss toast** (route · category · amount); no toast library is added.
- **`a`/`:` are new intent-mapper bindings** (`open-quick-add`, `open-capture`); the exhaustive dispatch switch forces them to be handled.
- **QuickAdd gains an `autoFocusField?: 'amount' | 'category'` prop** (default `'amount'`, preserving today's behavior). The prefill path passes `'category'` so the cursor lands on the category picker after `:` hands off — `autoFocus` on Amount is currently hardcoded, so this is the one small QuickAdd change the prefill flow needs.
- **The `:` bar is bottom-anchored** (the Vim `:` idiom the feature is named for), not a centered command-palette overlay.
- **Prefill hand-off is not silent**: the unresolved `#token` is carried into QuickAdd (seeds the category search / shown) so an ambiguous or unmatched category is visible, not just an empty picker.

---

## Open Questions

### Resolved During Planning

- Global QuickAdd mechanism → `CaptureProvider` + its own route-resolved QuickAdd instance (Key Technical Decisions).
- Confirmation surface → a new minimal auto-dismiss toast component.
- Parser rules → amount-first (`$`-stripped), trailing-`#`-only category, prefix resolution.

### Deferred to Implementation

- Categories/panels loading strategy in the provider — eager both-routes load vs. lazy on first capture-open. Either works; pick during impl based on cost. If lazy, guard the window where `resolveCategory` runs against a not-yet-loaded (empty) list so it doesn't spuriously route every capture to prefill.
- `CaptureBar` and toast visual styling details; toast auto-dismiss duration; exact target-route affordance in the bar.
- New-account edge: when the target route has no categories at all, the prefill QuickAdd opens with an empty picker — confirm QuickAdd's empty-category state is acceptable (it predates this feature) or surface a hint.

---

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for review, not implementation specification._

```
`:` Enter → parseCaptureLine(input) → { amount, note, categoryToken }
   │
   ├─ amount invalid? ───────────────────────────────┐
   ├─ no categoryToken? ─────────────────────────────┤
   ├─ resolveCategory(token, targetRoute cats) =      │
   │     none | ambiguous? ──────────────────────────┤
   ├─ target route has no default panel? ────────────┤
   │                                                  ▼
   │                                       openQuickAdd({ amount, note })
   │                                       (prefill; focus Category; nothing created)
   │
   └─ all resolve → createExpense(targetRoute default panel, matched
                     category, note, today) → confirmation toast → close bar
```

---

## Implementation Units

### U1. Pure `:` capture parser + category resolver

**Goal:** Parse a capture line and resolve a category token, with no DOM/state — the testable contract `:` builds on.

**Requirements:** R7, R8

**Dependencies:** None

**Files:**

- Create: `apps/web/src/lib/keyboard/capture.ts`
- Test: `apps/web/src/lib/keyboard/capture.test.ts`

**Approach:**

- `parseCaptureLine(input)` → `{ amount: number | null, note: string, categoryToken: string | null }`. Tokenize on whitespace; token 0 = amount (strip a leading `$`, `parseFloat`, `null` if `NaN` or ≤ 0); if the last token starts with `#`, it's the category token (minus `#`) and the note is the middle tokens joined; otherwise category token is null and the note is tokens 1..n.
- `resolveCategory(token, categories)` → `{ status: 'resolved' | 'none' | 'ambiguous'; category? }`: case-insensitive prefix match against category names; exactly one → resolved, zero → none, more than one → ambiguous.

**Execution note:** Implement test-first — this is the contract U4 depends on.

**Patterns to follow:** `apps/web/src/lib/keyboard/intents.ts` (pure, table-driven, fully unit-tested).

**Test scenarios:**

- Happy path: `12.50 coffee #food` → amount 12.5, note "coffee", token "food". `$12.50 coffee` → strips `$`. `12 lunch` → amount 12, note "lunch", token null.
- Edge: `coffee` (no amount) → amount null. `0`, `-5`, `abc` → amount null. `12.50` (no note) → note "". Note containing a non-trailing `#`: `12 lunch #2 with bob` → last token "bob", so category token null and `#2` stays in the note.
- Covers AE5. `resolveCategory`: exact prefix single match → resolved (case-insensitive); `f` against {Food, Fitness} → ambiguous (Covers AE3); no match → none.

**Verification:** Parser and resolver return correct shapes across amount formats, trailing-vs-non-trailing `#`, and the three resolution outcomes.

---

### U2. CaptureProvider + global route-resolved QuickAdd

**Goal:** A shell-mounted provider that resolves the target route, renders a route-resolved QuickAdd, and exposes `openQuickAdd(prefill?)` — the integration seam the keyboard bindings dispatch to.

**Requirements:** R1, R4, R5, R6

**Dependencies:** None

**Files:**

- Create: `apps/web/src/hooks/useCapture.tsx`
- Create: `apps/web/src/hooks/useCapture.test.tsx`
- Modify: `apps/web/src/components/Layout.tsx` (mount `CaptureProvider`, render the capture QuickAdd)
- Modify: `apps/web/src/components/QuickAdd.tsx` (add the `autoFocusField` prop — see Key Technical Decisions)

**Approach:**

- `CaptureProvider` mounted in `Layout` **as an ancestor of `KeyboardLayer`** (which calls `useKeyboardShortcuts`) so `useCapture()` resolves from the hook — mirror how `KeyboardCursorProvider` wraps `KeyboardLayer`. A sibling placement makes `useCapture()` return null and the bindings silently no-op.
- Resolve the target route from the current route (personal/business path) and fall back to Personal (`useAppState().personalRouteId`) on no-context routes.
- Load categories + panels for both routes (reusing `useCategories`/`usePanels`) so QuickAdd's existing route-based panel resolution works; default the selected category to the target route's first category.
- Own QuickAdd open-state + optional prefill (`{ amount?, note? }`). Render one `<QuickAdd>` showing the target route. `onAdd` reuses the `createExpense → logSyncEntry → markPending → triggerSync` sequence.
- Expose via context: `openQuickAdd(prefill?)` and the resolved target route. The keyboard hook consumes this context (like `useKeyboardCursor`).

**Patterns to follow:** `apps/web/src/hooks/useKeyboardCursor.tsx` (Layout-mounted context the hook consumes); `RouteView.handleAddExpense`; `QuickAdd` `pickDefaultPanel` + cross-route handling.

**Test scenarios:**

- Happy path: target route is the current route on `/personal` and `/business`; Personal on `/dashboard` and `/settings` (Covers AE4). `openQuickAdd()` opens QuickAdd with the target route shown and amount focused.
- Prefill: `openQuickAdd({ amount: 12.5, note: 'coffee' })` opens QuickAdd with those filled, focus on Category.
- Integration: QuickAdd `onAdd` creates an expense in the target route's default panel via the test DB.

**Verification:** Target-route resolution is correct per route; the global QuickAdd opens blank or pre-filled and persists through the real create+sync path.

---

### U3. `a` binding → open QuickAdd

**Goal:** `a` opens the global QuickAdd instantly.

**Requirements:** R1, R3

**Dependencies:** U2

**Files:**

- Modify: `apps/web/src/lib/keyboard/intents.ts` (add `a` → `open-quick-add`, extend `KeyAction`)
- Modify: `apps/web/src/hooks/useKeyboardShortcuts.ts` (consume capture context; dispatch `open-quick-add`)
- Modify: `apps/web/src/lib/keyboard/bindings.ts` (cheatsheet entry)
- Test: `apps/web/src/lib/keyboard/intents.test.ts`, `apps/web/src/hooks/useKeyboardShortcuts.test.tsx`

**Approach:** Add `a` to `SINGLE_KEYS` → new `open-quick-add` action; add the variant to `KeyAction` (the exhaustive switch will fail to compile until handled). The hook reads the capture context and dispatches `open-quick-add` → `openQuickAdd()`. Add `a` to `KEYBOARD_BINDINGS`.

**Patterns to follow:** Phase 1 intent-mapper + the cursor-context consumption pattern in `useKeyboardShortcuts.ts`.

**Test scenarios:**

- `intents`: `a` → `open-quick-add`; `fieldFocused` suppresses it.
- Hook: `a` calls `openQuickAdd` (spy); `a` is a no-op when no capture provider is mounted; `a` while a field is focused does nothing; the cheatsheet lists `a`.
- Covers AE4 (integration with U2: `a` on the Dashboard opens QuickAdd targeting Personal).

**Verification:** `a` opens the global QuickAdd on desktop, respects the field/modal guards, and appears in the cheatsheet.

---

### U4. `:` command bar + one-shot create / prefill fallback

**Goal:** `:` opens a command bar that creates in one shot when everything resolves, else pre-fills QuickAdd.

**Requirements:** R2, R3, R7, R8, R9, R10

**Dependencies:** U1, U2

**Files:**

- Create: `apps/web/src/components/CaptureBar.tsx`
- Create: `apps/web/src/components/CaptureBar.test.tsx`
- Modify: `apps/web/src/lib/keyboard/intents.ts` (`:` → `open-capture`), `apps/web/src/hooks/useKeyboardShortcuts.ts` (dispatch), `apps/web/src/hooks/useCapture.tsx` (capture-bar state + submit logic), `apps/web/src/lib/keyboard/bindings.ts`

**Approach:** `:` → `open-capture` → opens `CaptureBar` — a **bottom-anchored** single-line input (the Vim `:` idiom) showing the target route, autofocused; `Esc` closes. On Enter: `parseCaptureLine` (U1) → `resolveCategory` against the **target route's** categories. If amount valid AND resolved AND a default panel exists → create (target route default panel, matched category, note, today) → confirmation (U5) → close. Otherwise → `openQuickAdd({ amount, note, categoryToken })` and close the bar — the unresolved `#token` is carried so QuickAdd can seed/show why it didn't one-shot (not a silent empty picker).

**Patterns to follow:** `Modal`/`FormInput` styling; the U2 create path; the Phase 1 dispatch pattern.

**Test scenarios:**

- `intents`: `:` → `open-capture`.
- Covers AE1: `:` then `12.50 coffee #food` (Food + default panel exist) creates exactly one expense (Personal/target route, default panel, Food, today, $12.50, "coffee").
- Covers AE2: `:12.50 coffee` (no `#category`) → QuickAdd opens pre-filled (amount, note); nothing created.
- Covers AE3: ambiguous `#f` → prefill, not created, and the unresolved token is carried into QuickAdd.
- Covers AE5: no amount (`coffee`) → prefill, nothing created.
- Edge: target route has no default panel → prefill; `Esc` closes the bar with nothing created; the bar shows the target route.

**Verification:** One-shot create fires only when all inputs resolve; every uncertain case opens a pre-filled QuickAdd; nothing is created on cancel.

---

### U5. One-shot confirmation toast

**Goal:** After a one-shot `:` create, briefly confirm where it landed.

**Requirements:** R11

**Dependencies:** U4

**Files:**

- Create: `apps/web/src/components/CaptureToast.tsx`
- Create: `apps/web/src/components/CaptureToast.test.tsx`
- Modify: `apps/web/src/hooks/useCapture.tsx` (toast state set on one-shot create), `apps/web/src/components/Layout.tsx` (render the toast)

**Approach:** A minimal fixed-position toast with `role="status"` + `aria-live="polite"` so screen readers announce it without focus (the feature targets keyboard users — a confirmation they can't perceive is no confirmation). On a one-shot create, the provider sets `{ route, category, amount }`; `CaptureToast` renders it (e.g., "Personal · Food · $12.50") and auto-dismisses after a short timeout, with `Esc` (or any key) dismissing it early. No toast library; mirror `ExpenseRow`'s timer cleanup.

**Patterns to follow:** `ExpenseRow` 3s timer + cleanup; `UpdateBanner` fixed-position styling.

**Test scenarios:**

- Covers AE6: after a one-shot create, the toast shows route · category · amount.
- Edge: toast auto-dismisses after the timeout (fake timers); the prefill path does **not** show the toast.
- Accessibility: the toast root carries `role="status"`/`aria-live="polite"`; `Esc` dismisses it early.

**Verification:** The toast appears only on one-shot create, shows the right summary, and clears itself.

---

## System-Wide Impact

- **Interaction graph:** two new intent-mapper actions (`open-quick-add`, `open-capture`); the Phase 1 exhaustive dispatch switch forces them to be wired. The keyboard hook gains a second consumed context (`useCapture`) alongside `useKeyboardCursor`.
- **Modal coexistence:** a second QuickAdd instance lives in the shell. Only one `<dialog>` is open at a time, and the Phase 1 `dialog[open]` guard prevents `a`/`:` from firing while any modal is open.
- **Data path:** capture creates reuse the existing `createExpense → logSyncEntry → markPending → triggerSync` sequence — no new persistence or sync path; no migrations.
- **Keydown weight:** DB writes happen in the provider's async `onAdd`, never inside the keydown handler (preserve the lightweight-handler invariant).
- **Unchanged invariants:** per-view QuickAdds and their buttons; data model; Phase 1 navigation/cursor behavior.

---

## Risks & Dependencies

| Risk                                                         | Mitigation                                                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Two QuickAdd instances cause confusion or double-open        | Only the capture instance is keyboard-driven; both are `<dialog>`s (one open at a time); guard bails on `dialog[open]`. |
| Loading both routes' categories/panels adds load cost        | Data is small; lazy-load on first capture-open if needed (deferred to impl).                                            |
| Parser mis-parses a trailing `#token` the user meant as note | Unresolved/ambiguous always falls back to a visible prefill — never a wrong one-shot create.                            |
| Confirmation needs a brand-new toast component               | Keep it minimal (fixed div + timer); no library.                                                                        |
| Depends on Phase 1 engine (intent-mapper, guards, gating)    | Phase 1 is merged on `feat/vim-keyboard-shortcuts`; build Phase 2 on that branch.                                       |

---

## Sources & References

- **Origin document:** [docs/brainstorms/vim-fast-capture-requirements.md](docs/brainstorms/vim-fast-capture-requirements.md)
- **Multi-phase plan (U7):** [docs/plans/2026-06-26-vim-keyboard-shortcuts-plan.md](docs/plans/2026-06-26-vim-keyboard-shortcuts-plan.md)
- Key integration points: `apps/web/src/components/QuickAdd.tsx`, `apps/web/src/components/Layout.tsx`, `apps/web/src/hooks/useKeyboardCursor.tsx`, `apps/web/src/lib/keyboard/intents.ts`, `apps/web/src/views/RouteView.tsx`
