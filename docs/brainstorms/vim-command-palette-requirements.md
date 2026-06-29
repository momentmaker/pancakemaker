---
date: 2026-06-29
topic: vim-command-palette
---

# Vim Command Palette (Phase 3)

## Summary

A desktop-only fuzzy command palette for pancakemaker, opened with `Cmd-K` / `Ctrl-K`: a centered overlay that fuzzy-matches across the app's navigable entities (routes, categories, panels) plus recent expenses, and runs a curated set of actions (add expense, export, cheatsheet, sync now). It is the keyboard "navigate and act" surface that complements Phase 2's bottom `:` capture bar (`:` captures an expense; `Cmd-K` goes anywhere and runs commands). Results are grouped by type and fuzzy-ranked within each group.

---

## Problem Frame

Phase 1 made the app keyboard-navigable along visible lists; Phase 2 made expense capture keystroke-fast. But getting _to_ a specific category, panel, or past expense still means mouse-driven navigation or `g`-prefix route jumps followed by scanning. A power user who lives on the keyboard wants one motion — `Cmd-K`, type a few letters, Enter — to reach any destination or fire any command from anywhere. This realizes R18–R19 of the origin roadmap and resolves the product question it deferred: exactly which entities and actions the palette exposes, and how results are ranked and presented (see origin: [docs/brainstorms/vim-keyboard-shortcuts-requirements.md](docs/brainstorms/vim-keyboard-shortcuts-requirements.md), R18–R19; roadmap [docs/plans/2026-06-26-vim-keyboard-shortcuts-plan.md](docs/plans/2026-06-26-vim-keyboard-shortcuts-plan.md)).

---

## Key Flows

- F1. Jump to an entity
  - **Trigger:** User presses `Cmd-K`, types part of a route / category / panel name, presses Enter on the highlighted result.
  - **Steps:** Palette opens centered → fuzzy-matches the query across the index → groups and ranks results → Enter navigates to the selected destination and closes the palette.
  - **Outcome:** Any route, category, or panel is reachable in a few keystrokes, mouse-free.
  - **Covered by:** R1, R4, R5, R6, R12, R13, R15

- F2. Find a recent expense
  - **Trigger:** User presses `Cmd-K` and types part of an expense note or amount.
  - **Steps:** Matching recent expenses appear under their group → Enter navigates to where the expense lives (its category/panel detail view) and lands the Phase 1 cursor on that row.
  - **Outcome:** "Where did I log that?" answered without scrolling; the user arrives with the row already focused for follow-up (`o`/`d`).
  - **Covered by:** R7, R12, R13, R15

- F3. Run a command
  - **Trigger:** User presses `Cmd-K` and selects an action (Add expense, Export CSV/JSON, Open cheatsheet, Sync now).
  - **Steps:** Palette runs the action (opens QuickAdd, triggers the export download, opens the cheatsheet, or fires a manual sync) and closes.
  - **Outcome:** Curated high-value commands are reachable from anywhere without hunting for their buttons.
  - **Covered by:** R8, R9, R10, R11, R15

---

## Requirements

**Entry & coexistence**

- R1. `Cmd-K` (macOS) / `Ctrl-K` opens a centered fuzzy command palette overlay from anywhere shortcuts are active — **including while a text field is focused**, since it is a modifier chord rather than a bare key. `Esc` closes it; selecting a result runs it and closes the palette.
- R2. The palette is desktop-only (inherits the Phase 1 `useIsDesktop` gate) and stands down when another overlay already owns the screen — an open QuickAdd modal or the Phase 2 `:` capture bar. One overlay owns the keyboard at a time.
- R3. The palette is the "navigate and act" surface and complements, but does not replace, the Phase 2 `:` capture bar (capture). Both compose with the Phase 1 keyboard engine and guards.

**Index — jump targets**

- R4. Routes: Dashboard, Personal, Business, Settings — selecting navigates to the route.
- R5. Categories: every category across both routes — selecting navigates to that category's detail view.
- R6. Panels: every panel across both routes — selecting navigates to that panel's detail view.
- R7. Recent expenses: a bounded set of recent expenses, matchable by note and amount — selecting navigates to where the expense lives (its category/panel detail view) and places the Phase 1 cursor on that row.

**Actions**

- R8. Add expense — opens the global QuickAdd (same surface as `a`).
- R9. Export CSV and Export JSON — trigger the existing Settings export.
- R10. Open keyboard cheatsheet — surfaces the `?` cheatsheet.
- R11. Sync now — triggers a manual sync (`forceSync`).

**Matching & presentation**

- R12. Matching is case-insensitive and fuzzy across all indexed entities and actions, ranked by match quality within each group.
- R13. Results are grouped by type with section headers (Routes · Categories · Panels · Recent expenses · Actions); the keyboard cursor moves across the grouped, flattened result list.
- R14. With an empty query, the palette shows a useful default set so it is usable with zero typing (the routes, a few most-recent expenses, and the actions).
- R15. Selecting a result executes it — navigation or action — and closes the palette.

---

## Acceptance Examples

- AE1. **Covers R4, R12, R15.** When the user presses `Cmd-K` and types `bus`, the "Business" route ranks at the top; pressing Enter navigates to `/business` and closes the palette.
- AE2. **Covers R5, R13, R15.** Given a "Meals" category on Personal, when the user types `meal`, it appears under the **Categories** group; Enter navigates to that category's detail view.
- AE3. **Covers R7, R15.** Given a recent expense noted "coffee", when the user types `coff`, it appears under **Recent expenses**; Enter navigates to where it lives and the Phase 1 cursor is on that expense's row.
- AE4. **Covers R8.** When the user selects "Add expense", the QuickAdd modal opens and the palette closes.
- AE5. **Covers R11.** When the user selects "Sync now", a manual sync is triggered and the palette closes.
- AE6. **Covers R2.** Given a QuickAdd modal is already open, pressing `Cmd-K` does not open the palette.
- AE7. **Covers R14.** When the user opens the palette and types nothing, the routes, a few recent expenses, and the actions are listed under their group headers.
- AE8. **Covers R1.** While the caret is in a text input, pressing `Cmd-K` still opens the palette.

---

## Success Criteria

- A keyboard user can reach any route, category, panel, or recent expense — and run any curated command — from anywhere in a few keystrokes, mouse-free.
- Finding a past expense by note/amount lands the user on the row with the cursor already on it, ready for a follow-up action.
- The feature is additive on Phases 1–2 (intent-mapper, desktop gate, overlay stand-down, cursor system) and does not regress navigation, capture, or mouse flows.
- `ce-plan` can implement without inventing the index contents, action set, grouping, or coexistence behavior.

---

## Scope Boundaries

### Deferred for later

- Sign out, quick-create (New panel / Add category), and an archived-panel visibility toggle — considered and cut from the action set for now; the palette stays a navigate + high-value-command surface.
- Month scrub / jump-to-month — that is Phase 4.
- Command history, frecency ranking, and pinned/favorite commands — the empty-state default set is fixed, not learned.
- Acting on a result without leaving the palette (e.g., delete an expense inline) — selecting always navigates or runs, then closes.

### Outside this product's identity

- Mobile/touch — inherits the Phase 1 desktop-only gate.
- Demo-persona parity — deferred alongside the Phase 1–2 demo deferral.
- A general extensible/plugin command registry — the action set is a fixed, curated list.

---

## Key Decisions

- **Scope = jump + curated actions.** Fuzzy-jump to routes, categories, panels, and recent expenses, plus a small hand-picked action set (Add expense, Export CSV/JSON, Open cheatsheet, Sync now) — the most palette value for a bounded, maintainable surface. A full keymap mirror and a merge-with-`:` omnibar were both considered and rejected.
- **Recent expenses are first-class index entries**, and selecting one navigates and lands the Phase 1 cursor on the row — turning the palette into "find anything," reusing the existing cursor system rather than building a new highlight.
- **Grouped-by-type presentation** with intra-group fuzzy ranking — chosen over a flat global ranking for discoverability across heterogeneous types and for deterministic, testable ordering.
- **`Cmd-K` opens from anywhere, including inside fields**, because it is a modifier chord; but only when no other overlay owns the screen (one overlay at a time).
- **Complementary to `:`, not merged:** `:` (bottom bar) captures; `Cmd-K` (centered overlay) navigates and acts. Preserves the just-shipped Phase 2 split.
- **Lean on no new dependency:** a hand-rolled, pure, testable fuzzy matcher in the Phase 1–2 spirit is the intended direction (final lib-vs-handroll call belongs to planning).

---

## Dependencies / Assumptions

- Depends on Phase 1 (intent-mapper, `useIsDesktop` gate, overlay/popover stand-down via `dialog[open]` / `data-kbd-popover-open`, and the cursor system) and Phase 2 (CaptureProvider, global QuickAdd, `:` bar), all on `feat/vim-keyboard-shortcuts`.
- The Phase 1 `useKeyboardShortcuts` hook currently handles bare keys and ignores modifier chords; opening on `Cmd-K`/`Ctrl-K` (and doing so even while a field is focused) is a new handling path to add during planning.
- Cross-view cursor targeting — navigate to a detail view, wait for it to mount and register its rows, then place the cursor on a specific expense row — is the one genuinely new integration with the Phase 1 cursor system and the main implementation risk.
- Assumes the existing Settings export (CSV/JSON), `forceSync`, and cheatsheet are invocable from a shared/global location (or can be lifted to one) so the palette can trigger them without duplicating logic.
- No general command/registry abstraction exists today; the palette index + action set is built fresh.

---

## Outstanding Questions

### Resolve Before Planning

- None — the product decisions (scope, index, action set, presentation, coexistence) are settled above.

### Deferred to Planning

- [Affects R7][Technical] "Recent" window — how recent expenses are bounded (last N vs a time window) and loaded for the index without a heavy query.
- [Affects R7][Technical] Cross-view cursor targeting mechanism — how the palette hands a target expense id to a detail view that has not mounted yet, and lands the cursor once its rows register.
- [Affects R12][Technical] Fuzzy-match algorithm and ranking — subsequence vs prefix scoring, tie-breaking, and whether a small dependency is justified vs a hand-rolled matcher.
- [Affects R1, R2][Technical] Modifier-chord handling in `useKeyboardShortcuts` — opening on `Cmd-K`/`Ctrl-K` from within fields while still standing down for other overlays.
- [Affects R9] Whether Export is one palette entry with a format choice or two entries (Export CSV / Export JSON).
- [Affects R8, R10, R11] Where the shared invocations for QuickAdd / cheatsheet / export / `forceSync` live so the palette and existing buttons share one path.
