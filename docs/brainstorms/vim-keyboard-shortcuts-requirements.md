---
date: 2026-06-26
topic: vim-keyboard-shortcuts
---

# Vim-Style Keyboard Shortcuts (Desktop)

## Summary

Desktop-only vim-style keyboard control for pancakemaker, delivered in four independently shippable phases: navigation (the engine), fast capture, a command palette, and f-hints. The core is a testable pure intent-mapper plus a thin React hook that owns the global keydown listener, ported from the proven pattern in the sibling `ypuf` project.

---

## Problem Frame

Pancakemaker is an offline-first expense PWA used repeatedly — often daily. On desktop, every interaction today routes through the mouse: clicking into rows, hunting for the right card, reaching for the QuickAdd button, picking a month from a control. The highest-frequency action — logging an expense — carries real activation energy each time, and reviewing/navigating a list-heavy app by mouse is slower than it needs to be for someone who lives on the keyboard.

The app is unusually well-shaped for keyboard control: it is fundamentally a list-of-things-you-act-on (expense rows → category/panel cards → routes), which is exactly vim's mental model. The `ypuf` project already validated a hand-rolled vim-shortcut architecture (pure intent-mapper + thin DOM glue, an input-focus guard, a `?` cheatsheet, cursor highlighting), so the hard design problems are de-risked. The one thing `ypuf` never had to solve — it is a desktop-only browser extension — is mobile gating, which a responsive PWA does need.

---

## Key Flows

- F1. Navigate and act on a list (Phase 1)
  - **Trigger:** User presses `j`/`k` on a route or detail view.
  - **Steps:** A keyboard cursor highlights an item and scrolls it into view → `j`/`k` move it, `gg`/`G` jump to ends → `Enter`/`o` drills into a card or enters inline-edit on a row → `d` arms then confirms delete via the existing 2-tap flow, `yy` duplicates → `Esc` clears the cursor.
  - **Outcome:** The user has navigated and acted on expenses without the mouse.
  - **Covered by:** R7, R8, R9, R10, R11, R12, R15

- F2. Quick-capture an expense (Phase 2)
  - **Trigger:** User presses `a` or `:` from anywhere shortcuts are active.
  - **Steps:** `a` opens QuickAdd with the amount autofocused (existing behavior); OR `:` opens a command-line bar where a short expression (`:12.50 coffee`) parses into a new expense.
  - **Outcome:** An expense is logged in seconds without leaving the keyboard.
  - **Covered by:** R16, R17

---

## Requirements

**Foundation (the engine — built in Phase 1, shared by all phases)**

- R1. Shortcuts are active only on desktop viewports. Below the app's existing desktop breakpoint (the `sm` / 640px threshold already used for nav), the system is inert.
- R2. The system is built as a pure intent-mapper (key + context → action name, no DOM) plus a thin React hook that owns a single global keydown listener. The intent-mapper is the registration point that Phases 2–4 extend.
- R3. Shortcuts never fire while the user is typing in an input, textarea, select, or contenteditable element. In that state only `Esc` is honored (to blur/cancel).
- R4. While a modal/dialog owns the keyboard (e.g., QuickAdd, Add Panel), navigation and action shortcuts stand down. The modal's own native Escape/close handling is unaffected.
- R5. Held keys do not repeat-fire mutating actions (guard on key-repeat).
- R6. A cheatsheet overlay lists all currently active shortcuts, opened with `?` and dismissed with `Esc`. It is the discoverability surface — invisible until used, with focus restored on close.

**Phase 1 — Navigation & actions**

- R7. `j` / `k` move a keyboard cursor down/up through the list in the current view (category/panel cards on route views; expense rows on detail views).
- R8. The cursored item is visually highlighted and scrolled into view as the cursor moves.
- R9. `gg` jumps to the first item; `G` jumps to the last.
- R10. `Enter` / `o` opens or edits the cursored item — drilling into a card, or entering inline-edit on a row — reusing the existing interactions.
- R11. `d` deletes the cursored expense through the existing 2-tap confirm (first `d` arms, second `d` confirms; `Esc` cancels). No new destructive path is introduced.
- R12. `yy` duplicates the cursored expense via the existing Duplicate action.
- R13. `/` focuses the current view's filter/search field.
- R14. `g`-prefixed bindings jump between routes: `gd` → Dashboard, `gp` → Personal, `gb` → Business, `gs` → Settings.
- R15. `Esc` clears the keyboard cursor or blurs a focused field.

**Phase 2 — Fast capture**

- R16. `a` opens the QuickAdd modal immediately from anywhere shortcuts are active, with the amount field autofocused (existing QuickAdd behavior).
- R17. `:` opens a command-line capture bar that parses a short expression (e.g., `:12.50 coffee`) into a new expense (amount + description, with category/route resolution per the Outstanding Questions below).

**Phase 3 — Command palette**

- R18. `Cmd-K` / `Ctrl-K` opens a fuzzy command palette.
- R19. The palette can jump to any category, panel, or route, and run available actions (e.g., add expense, switch the Categories/Panels tab, toggle archived).

**Phase 4 — f-hints & month scrub**

- R20. `f` enters f-hint mode: letter badges appear on visible targets (cards/rows); typing the letter(s) jumps to or opens that target, and a mistype exits silently (ported from `ypuf`).
- R21. `[` / `]` move the active list to the previous/next month, driving the existing month-picker state.

---

## Acceptance Examples

- AE1. **Covers R3.** Given the QuickAdd amount field is focused, when the user presses `j`, the cursor does not move and `j` is ignored as a shortcut (normal typing behavior in the field is unaffected).
- AE2. **Covers R4.** Given the QuickAdd modal is open, when the user presses `d`, no expense is deleted.
- AE3. **Covers R1.** Given a mobile-width viewport (below the desktop breakpoint), when the user presses any shortcut key, nothing happens.
- AE4. **Covers R11.** Given an expense row is cursored, when the user presses `d` then `d`, the expense is deleted through the existing confirm flow; when the user presses `d` then `Esc`, the delete is canceled.
- AE5. **Covers R6.** Given any active view, when the user presses `?`, the cheatsheet overlay appears; pressing `Esc` closes it and restores prior focus.
- AE6. **Covers R10.** Given a category card is cursored on a route view, when the user presses `Enter`, the app navigates into that category's detail view.
- AE7. **Covers R5.** Given an expense row is cursored, when the user holds `d`, the delete does not repeat-fire across the held keypresses.

---

## Success Criteria

- A keyboard-first user can log an expense and navigate the app end-to-end without touching the mouse, and it feels faster than mouse for daily use.
- Each phase is usable and valuable on its own — Phase 1 ships and stands alone before Phase 2 begins.
- The pure intent-mapper has unit tests covering key→action mapping including the field-focus, modal-open, key-repeat, and mobile-gate guards.
- `ce-plan` can implement Phase 1 from this doc without inventing bindings, guard behavior, or which existing interaction each action reuses.

---

## Scope Boundaries

- Mobile/touch — shortcuts are inert below the desktop breakpoint; not addressed in any phase.
- Numeric counts (`3j`) and strict-vim grammar (mandatory `dd`/`yy`-only delete) — dropped in favor of pragmatic single-key bindings.
- No new delete or undo machinery — destructive actions reuse the existing 2-tap confirm.
- No user-facing remapping/customization UI for bindings in this scope.
- No third-party hotkey library — hand-rolled, following the `ypuf` pattern.

---

## Key Decisions

- Engine-first phasing (navigation before capture/palette/hints): the intent-mapper built in Phase 1 is the shared registration point every later phase plugs into, so the foundation ships first and de-risks the rest.
- Pragmatic single-key bindings + reuse of the existing 2-tap confirm: fewer keys to learn, trusted safety UX already in the app, and a smaller Phase 1 surface than strict vim grammar.
- Pure-core (intent-mapper) + thin React hook, ported from `ypuf`: testable without the DOM, no new dependency, and a pattern already validated in production.
- Desktop gating via the app's existing responsive breakpoint: pancakemaker is a responsive PWA, so shortcuts must opt out on mobile rather than assume a physical keyboard (the one design problem `ypuf` never had).

---

## Dependencies / Assumptions

- Assumes the following existing interactions are reusable as the action layer (verified by repo scan): inline row edit with Enter/Esc and 2-tap delete in `apps/web/src/components/ExpenseRow.tsx`, the Duplicate action on the same row, the amount-autofocus QuickAdd in `apps/web/src/components/QuickAdd.tsx`, and the month picker + Categories/Panels tabs in `apps/web/src/views/RouteView.tsx`.
- Assumes "desktop" implies a physical keyboard. A Bluetooth keyboard paired to a tablet at mobile width is an accepted edge that falls on the inert (mobile) side of the breakpoint.
- No global keyboard system or hotkey library exists today (verified) — this is net-new infrastructure.

---

## Outstanding Questions

### Resolve Before Planning

- None that block Phase 1.

### Deferred to Planning

- [Affects R17][User decision] Capture-target resolution: when `:`/`a` capture fires without a route context (e.g., from the Dashboard), which route and default category does the new expense use?
- [Affects R17][Needs research] Capture grammar depth: how much does `:` parse — category tokens (e.g., `#groceries`), date tokens, amount-first vs description-first ordering?
- [Affects R19] Command palette index + action set: exactly which entities and actions are exposed.
- [Affects R20][Technical] f-hint target set: which on-screen elements receive badges given React rendering (and any list virtualization).
