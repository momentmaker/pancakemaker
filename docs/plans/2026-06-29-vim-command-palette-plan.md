---
date: 2026-06-29
title: 'feat: Vim command palette (Phase 3)'
type: feat
status: active
origin: docs/brainstorms/vim-command-palette-requirements.md
---

# feat: Vim command palette (Phase 3)

## Summary

Add a desktop-only `Cmd-K` / `Ctrl-K` fuzzy command palette to pancakemaker — a centered overlay that fuzzy-matches across the app's navigable entities (routes, categories, panels) plus recent expenses, and runs a curated action set (add expense, export CSV/JSON, open cheatsheet, sync now). Results are grouped by type and fuzzy-ranked within each group via a new pure, hand-rolled matcher (no new dependency). It complements Phase 2's bottom `:` capture bar (`:` captures; `Cmd-K` navigates and acts). The one genuinely new integration is cross-view cursor targeting: selecting a recent expense navigates to its detail view and lands the Phase 1 cursor on that row, via a new `requestFocus(id)` on the cursor that `registerList` consumes when the target view mounts. Builds on the Phase 1 engine and Phase 2 capture, both on `feat/vim-keyboard-shortcuts`.

Realizes R18–R19 of the origin roadmap and resolves the product scope deferred there (see origin: [docs/brainstorms/vim-command-palette-requirements.md](docs/brainstorms/vim-command-palette-requirements.md); roadmap [docs/plans/2026-06-26-vim-keyboard-shortcuts-plan.md](docs/plans/2026-06-26-vim-keyboard-shortcuts-plan.md)).

---

## Problem Frame

Phase 1 made the app keyboard-navigable along visible lists; Phase 2 made capture keystroke-fast. Reaching a specific category, panel, or past expense still means mouse navigation or `g`-prefix jumps plus scanning. The palette gives one motion — `Cmd-K`, type, Enter — to reach any destination or run any curated command from anywhere. Product scope (index, action set, grouped presentation, coexistence with `:`) is settled in the origin doc; this plan resolves the technical unknowns it deferred: the recent-expenses window + loading, the cross-view cursor-targeting mechanism, the fuzzy algorithm + ranking, modifier-chord handling in `useKeyboardShortcuts`, the export entry shape, and where shared invocations live.

---

## Requirements Trace

Origin requirements (see origin doc for full text):

- **R1** `Cmd-K`/`Ctrl-K` opens the palette from anywhere, including while a field is focused → U8
- **R2** Desktop-only; stands down when another overlay owns the screen → U6, U8
- **R3** Complements (does not replace) the `:` capture bar → U7, U8
- **R4** Routes index → U5, U7
- **R5** Categories index (per route) → U5
- **R6** Panels index (per route) → U5
- **R7** Recent expenses index; select → navigate + land cursor on the row → U2, U3, U5, U7
- **R8** Action: add expense → U5, U7
- **R9** Action: export CSV / export JSON → U4, U5
- **R10** Action: open cheatsheet → U5, U7
- **R11** Action: sync now (`forceSync`) → U5, U7
- **R12** Case-insensitive fuzzy match, ranked within group → U1, U6
- **R13** Grouped-by-type presentation; cursor across the flattened list → U6
- **R14** Useful empty-query default set → U5, U6
- **R15** Selecting a result runs it and closes the palette → U6, U7

Acceptance Examples AE1–AE8 are carried into unit test scenarios (`Covers AE<N>.`).

---

## Key Technical Decisions

- **Hand-rolled pure fuzzy matcher, no new dependency.** A `fuzzyScore(query, text)` subsequence matcher with contiguous-run and word-start bonuses, plus a grouped ranker, in `apps/web/src/lib/command-palette/` — mirroring the pure, unit-tested `lib/keyboard/capture.ts` from Phase 2. Keeps deps minimal (current: react, react-router, recharts, wa-sqlite) and the core logic testable without the DOM.
- **Cross-view cursor targeting via a pending-target on the cursor.** Add `requestFocus(id)` to `KeyboardCursor`; it stores a pending id. `registerList` (the existing sync point that already runs when a view mounts and registers its rows) consumes the pending id: if the newly registered list contains it, the cursor activates it. The palette calls `cursor.requestFocus(expenseId)` then navigates — no fragile post-navigation timing/polling. This reuses the Phase 1 cursor wholesale rather than building a second highlight system.
- **`Cmd-K` is a dedicated modifier-chord branch in `useKeyboardShortcuts`, not an intent-mapper key.** The pure intent-mapper stays bare-key-only. The hook gets an early branch: `(e.metaKey || e.ctrlKey) && key === 'k'` → open palette, even when a field is focused (it is a chord, not a bare key), but only when `isBlockingOverlayOpen()` is false (stands down for an open QuickAdd / `:` bar / the palette itself). The branch lives inside the existing desktop-gated listener, so it inherits the desktop gate.
- **`CommandPaletteProvider` owns the palette + cheatsheet overlays and the index.** Mounted in `Layout` inside `CaptureProvider` + `KeyboardCursorProvider` (so it has navigate / capture / cursor / sync / db). It builds the index (routes, both routes' categories + panels, recent expenses), assembles the action registry, and renders both `CommandPalette` and the moved `KeyboardCheatsheet`. It exposes `openPalette()` and `openCheatsheet()`; `KeyboardLayer` passes `openCheatsheet` to `useKeyboardShortcuts` as `onCheatsheet` (the `?` path is unchanged), and the hook reads `openPalette` from the palette context (the Phase 2 `useCapture` consumption pattern).
- **Recent = last 50 by recency, no time filter.** A new `getRecentExpenses(db, limit = 50)` ordered by `date` then `created_at` descending, returning display + navigation fields. Bounded and cheap; `limit` is tunable.
- **Export is two palette entries** ("Export CSV", "Export JSON") rather than one entry with a format sub-choice — simpler palette interaction; both call the shared `exportData(db, userId, format)`.
- **Recent-expense jump target = the expense's category detail view** (`/[routeType]/category/[categoryId]`), which renders the expense rows and registers them with the cursor. (Panel detail is the alternative; category detail chosen as canonical.)
- **Palette selection uses its own local highlight index**, not the global cursor. The global cursor is for in-view list navigation; the palette manages its own up/down/Enter over the flattened grouped results and sets `data-kbd-popover-open` so the global layer stands down while it is open.

---

## High-Level Technical Design

_Directional guidance for review, not implementation specification._

Provider graph (Layout) and the two flows:

```
CaptureProvider
  KeyboardCursorProvider              # gains requestFocus(id) (pending target)
    CommandPaletteProvider            # NEW: owns palette + cheatsheet state, builds index + actions
      KeyboardLayer                   # useKeyboardShortcuts({ onCheatsheet: palette.openCheatsheet })
      <CommandPalette/>               # NEW overlay (rendered by the provider)
      <KeyboardCheatsheet/>           # moved here from KeyboardLayer
      <Outlet/> (routes, detail views — register expense rows with the cursor)
```

Jump-to-recent-expense (the cross-view flow):

```
palette: user selects a recent expense
  -> cursor.requestFocus(expenseId)        # stores pending target
  -> navigate(/[routeType]/category/[categoryId])
  -> close palette
detail view mounts -> useExpenseListCursor(orderedIds) -> registerList(items, ...)
  -> registerList sees pending target in items -> setActive(expenseId)  # cursor lands on the row
```

Cmd-K dispatch (in the existing desktop-gated keydown listener):

```
if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')):
    if isBlockingOverlayOpen(): return        # another overlay owns the keyboard
    paletteRef.openPalette(); e.preventDefault(); return   # fires even inside a field
# ...existing bare-key intent-mapper path unchanged
```

---

## Implementation Units

### U1. Pure fuzzy matcher + grouped ranker

**Goal:** A pure, DOM-free fuzzy match + rank module the palette filters with.
**Requirements:** R12, R13
**Dependencies:** none
**Files:**

- Create: `apps/web/src/lib/command-palette/fuzzy.ts`
- Create: `apps/web/src/lib/command-palette/fuzzy.test.ts`

**Approach:** `fuzzyScore(query, text): number | null` — case-insensitive subsequence match returning `null` on no match, else a score rewarding contiguous runs and word-start/boundary hits so `bus` ranks "Business" above an incidental scatter match. A `rankWithin(query, items, getText)` helper sorts matches by score descending with a stable tiebreaker. Keep it small and allocation-light; no dependency.
**Patterns to follow:** the pure-module + co-located plain-vitest test style of `apps/web/src/lib/keyboard/capture.ts` / `capture.test.ts`.
**Test scenarios:**

- Exact substring scores higher than a scattered subsequence; non-match returns `null`.
- Case-insensitive (`MEAL` matches "Meals").
- Word-start/boundary bonus: `bus` ranks "Business" at the top of a candidate set. (Covers AE1 ranking.)
- Empty query: defer to caller (returns a neutral/seed score or null per the documented contract) — assert the documented behavior.
- `rankWithin` orders a candidate set by score and is stable for equal scores.

**Verification:** Matching/ranking behavior is fully determined by unit tests; no DOM needed.

### U2. Recent-expenses query

**Goal:** Load a bounded set of recent expenses with the fields needed to display and navigate to them.
**Requirements:** R7, R14
**Dependencies:** none
**Files:**

- Modify: `apps/web/src/db/queries.ts` (add `getRecentExpenses`)
- Modify/Create: `apps/web/src/db/queries.test.ts` (or the nearest existing query test file) for the new query

**Approach:** `getRecentExpenses(db, limit = 50)` returns recent expenses ordered by `date` DESC, `created_at` DESC, limited to `limit`, joined to yield `{ id, description, amount, currency, date, category_id, category_name, route_type }` (route_type drives the jump URL; category_id is the jump target; description + amount drive display and matching). Mirror the joins in the existing `getExportRows`. Read-only; no schema change, so no migration.
**Patterns to follow:** existing join/select queries in `apps/web/src/db/queries.ts` (`getExportRows`), and the project's query-test setup (`setupTestDb`).
**Test scenarios:**

- Returns expenses newest-first, capped at `limit`.
- Each row carries the category_id, route_type, description, and amount needed for navigation + display.
- Empty DB returns `[]`.
- An expense with a null/empty description is returned (display falls back at the UI layer).

**Verification:** Query returns the expected bounded, ordered shape against a seeded test DB.

### U3. `requestFocus` cross-view cursor targeting

**Goal:** Let a caller ask the cursor to land on a specific item id once the list containing it registers.
**Requirements:** R7
**Dependencies:** none
**Files:**

- Modify: `apps/web/src/hooks/useKeyboardCursor.tsx` (add `requestFocus` + pending-target consumption in `registerList`)
- Modify: `apps/web/src/hooks/useKeyboardCursor.test.tsx` (or create if absent)

**Approach:** Add `requestFocus(id: string)` to `KeyboardCursor`; it stores the id in a `pendingTargetRef`. In `registerList`, after updating the items, if a pending target is set and the new `items` contain it, `setActive(pendingTarget)` and clear the pending ref (this branch takes priority over the existing deletion/overlap anchoring). If the pending target never appears (e.g., the destination view does not render that row), it stays pending until cleared or superseded — a benign no-op. Keep `requestFocus` stable (in the memoized value).
**Patterns to follow:** the existing `registerList` / `setActive` / `activeIdRef` logic in the same file; the stable-callback discipline noted in `useListCursor`.
**Test scenarios:**

- `requestFocus(id)` then `registerList` with a list containing `id` → `activeId === id`.
- `requestFocus(id)` then `registerList` with a list NOT containing `id` → `activeId` unchanged; later registering a list that DOES contain `id` activates it.
- A normal `registerList` with no pending target preserves the existing deletion-anchor / context-switch behavior (regression).
- Pending target is consumed once (a subsequent unrelated `registerList` does not re-activate it).

**Verification:** Cursor lands on the requested id exactly when its list registers; existing cursor behavior is unregressed.

### U4. Shared export invocation

**Goal:** One path for "export CSV/JSON" usable by both Settings and the palette.
**Requirements:** R9
**Dependencies:** none
**Files:**

- Modify: `apps/web/src/lib/export.ts` (add `exportData(db, userId, format)`)
- Modify: `apps/web/src/views/Settings.tsx` (route `handleExport` through `exportData`)
- Modify/Create: `apps/web/src/lib/export.test.ts` for the orchestration (or keep pure-format tests and assert the orchestrator wiring)

**Approach:** `exportData(db, userId, format: 'csv' | 'json'): Promise<void>` — query `getExportRows`, format via the existing `formatCSV`/`formatJSON`, and `downloadFile` with the dated filename. Settings' `handleExport` keeps its `setExporting` state but delegates the query+format+download to `exportData`. No behavior change for Settings; the palette calls `exportData` directly.
**Patterns to follow:** the current `handleExport` in `apps/web/src/views/Settings.tsx` and the helpers already in `apps/web/src/lib/export.ts`.
**Test scenarios:**

- `exportData(db, userId, 'csv')` produces CSV content matching `formatCSV(getExportRows(...))` and triggers a download with a `.csv` name (assert via a `downloadFile`/anchor or URL spy).
- `exportData(..., 'json')` produces JSON content and a `.json` name.
- Pure `formatCSV`/`formatJSON` tests remain green (regression).

**Verification:** Settings export is unchanged in behavior; `exportData` is the single shared entry point.

### U5. Command index + action registry

**Goal:** Assemble the palette's grouped index (entities + actions), each item carrying a label, group, match text, and a `run()`.
**Requirements:** R4, R5, R6, R7, R8, R9, R10, R11, R14
**Dependencies:** U2 (recent expenses), U4 (export)
**Files:**

- Create: `apps/web/src/lib/command-palette/types.ts` (item/group types)
- Create: `apps/web/src/hooks/useCommandIndex.ts` (builds the index from live data)
- Create: `apps/web/src/hooks/useCommandIndex.test.tsx`

**Approach:** Define a `CommandItem` shape `{ id, group: 'Routes'|'Categories'|'Panels'|'Recent expenses'|'Actions', label, sublabel?, matchText, run: () => void }`. `useCommandIndex` loads categories + panels for both routes (via `useCategories`/`usePanels` for personal and business, as `CaptureProvider` does for one route) and recent expenses (U2), and returns the grouped items plus the static action list. The `run` closures are injected by the provider (U7) so this hook stays about data assembly; alternatively the hook takes the action callbacks as args. Routes come from `navItems`. Empty-query default set = routes + the top few recent expenses + all actions (R14).
**Patterns to follow:** `apps/web/src/hooks/useCapture.tsx` (loading categories/panels per route, `useMemo` assembly).
**Test scenarios:**

- Index includes the four routes, every category and panel across both routes, and recent expenses, each under the right group. (Covers AE2 category presence, AE7 default set.)
- Actions group includes Add expense, Export CSV, Export JSON, Open cheatsheet, Sync now. (Covers AE7.)
- A recent-expense item's `run` requests focus on the expense id and navigates to its category detail route. (Covers AE3 — assert the navigate target + `requestFocus` call via injected spies.)
- Each entity item's `run` navigates to the correct route/detail path. (Covers AE1, AE2.)

**Verification:** The index reflects live categories/panels/expenses and each item runs the correct effect (spied).

### U6. CommandPalette overlay component

**Goal:** The centered palette UI — input, grouped results, local keyboard selection — filtered by U1.
**Requirements:** R1, R2, R12, R13, R15
**Dependencies:** U1
**Files:**

- Create: `apps/web/src/components/CommandPalette.tsx`
- Create: `apps/web/src/components/CommandPalette.test.tsx`

**Approach:** A centered overlay (a `<dialog>`-based Modal-style surface, or a fixed centered panel) that renders only when `open`. A text input (autofocused) at top; below it, results from `useCommandIndex` filtered/ranked by U1 and rendered in group sections with headers (R13). A local `highlightIndex` over the flattened visible results: ArrowUp/ArrowDown move it, Enter runs the highlighted item's `run()` and closes, Esc closes, mouse click runs. Empty query shows the default set (R14). The root carries `data-kbd-popover-open` so the global shortcut layer stands down (R2), and the input owning focus means bare keys never leak to the global hook. Props: `{ open, items, onClose }` (items already carry `run`), keeping the component presentation-focused and testable without the providers.
**Patterns to follow:** `apps/web/src/components/CaptureBar.tsx` (focus-on-open effect, Esc handling, `data-kbd-popover-open`); `apps/web/src/components/Modal.tsx` / `FormSelect`'s listbox for option-row styling and the `data-kbd-popover-open` listbox marker.
**Test scenarios:**

- Renders nothing when `open` is false; autofocuses the input when opened. (Covers AE8 mechanics at the component level.)
- Typing filters results and groups them under headers; a query like `bus` highlights the matching route first. (Covers AE1.)
- ArrowDown/ArrowUp move the highlight across the flattened grouped list; Enter calls the highlighted item's `run` and then `onClose`. (Covers R13, R15.)
- Esc calls `onClose`; clicking a result runs it and closes. (Covers R15.)
- Empty query shows the provided default set under their group headers. (Covers AE7.)
- Root carries `data-kbd-popover-open`. (Covers R2 stand-down mechanics.)

**Verification:** The overlay filters, groups, navigates by keyboard, runs selections, and marks itself a popover.

### U7. CommandPaletteProvider + Layout mount

**Goal:** Wire open-state, the index, the action `run`s, cheatsheet ownership, and render the overlay globally.
**Requirements:** R1, R3, R7, R8, R10, R11, R14, R15
**Dependencies:** U3, U4, U5, U6
**Files:**

- Create: `apps/web/src/hooks/useCommandPalette.tsx` (`CommandPaletteProvider`, `useCommandPalette`, exported `CommandPaletteContext` for tests)
- Modify: `apps/web/src/components/Layout.tsx` (mount the provider; move `KeyboardCheatsheet` into it; `KeyboardLayer` passes `palette.openCheatsheet` as `onCheatsheet`)
- Create: `apps/web/src/hooks/useCommandPalette.test.tsx`

**Approach:** Mirror `CaptureProvider`. The provider owns `paletteOpen` + `cheatsheetOpen` state, builds the index via `useCommandIndex` injecting the action `run`s: add expense → `useCapture().openQuickAdd()`; export CSV/JSON → `exportData(db, userId, format)`; open cheatsheet → `setCheatsheetOpen(true)`; sync now → `useSync().forceSync()`; recent-expense/entity navigation → `useNavigate()` (+ `useKeyboardCursor().requestFocus(id)` for expenses). It renders `<CommandPalette open=… items=… onClose=…/>` and `<KeyboardCheatsheet open=… onClose=…/>`. Exposes `{ openPalette, openCheatsheet }` (plus whatever the hook needs). Mount inside `CaptureProvider` + `KeyboardCursorProvider` in `Layout`; remove the cheatsheet from `KeyboardLayer`.
**Patterns to follow:** `apps/web/src/hooks/useCapture.tsx` (provider shape, context export for tests, rendering its own overlay); the current `KeyboardLayer` in `apps/web/src/components/Layout.tsx`.
**Test scenarios:**

- `openPalette()` opens the overlay; selecting "Add expense" opens QuickAdd and closes the palette. (Covers AE4, R15.)
- Selecting "Sync now" calls `forceSync` and closes. (Covers AE5.)
- Selecting "Open cheatsheet" opens the cheatsheet. (Covers R10.)
- Selecting a recent expense calls `requestFocus(id)` and navigates to its category detail route. (Covers AE3.)
- `openCheatsheet()` (the `?` path, via the provider) still opens the cheatsheet — regression for the moved overlay.

**Verification:** The provider opens/closes the palette, runs every action against the real contexts, and the cheatsheet still works after the move.

### U8. Cmd-K modifier-chord wiring

**Goal:** Open the palette on `Cmd-K`/`Ctrl-K` from anywhere (including fields), standing down for other overlays; advertise it.
**Requirements:** R1, R2, R3
**Dependencies:** U7
**Files:**

- Modify: `apps/web/src/hooks/useKeyboardShortcuts.ts` (modifier-chord branch + consume the palette context)
- Modify: `apps/web/src/hooks/useKeyboardShortcuts.test.tsx`
- Modify: `apps/web/src/lib/keyboard/bindings.ts` (cheatsheet entry for the palette)
- Modify: `apps/web/src/components/KeyboardCheatsheet.test.tsx` if the binding list assertion needs it

**Approach:** In the existing desktop-gated `keydown` listener, add an early branch: if `(e.metaKey || e.ctrlKey)` and `e.key` is `k`/`K`, and `isBlockingOverlayOpen()` is false, call the palette context's `openPalette()` and `preventDefault()`; return. This runs before the field-focus/bare-key path so it fires while typing, but `isBlockingOverlayOpen()` makes it stand down when a QuickAdd, the `:` bar, or the palette itself is open (R2, R3). Read `openPalette` from `useCommandPalette()` via a latest-value ref, exactly as the hook already consumes `useCapture` (Phase 2). Add a `Cmd-K — command palette` row to `KEYBOARD_BINDINGS`.
**Patterns to follow:** the Phase 2 `useCapture` consumption + `captureRef` pattern and the `isBlockingOverlayOpen` guard already in `apps/web/src/hooks/useKeyboardShortcuts.ts`.
**Test scenarios:**

- `Cmd-K` (metaKey) and `Ctrl-K` (ctrlKey) each call `openPalette` (spied via a stub `CommandPaletteContext.Provider`). (Covers AE-level R1.)
- `Cmd-K` while a text field is focused still calls `openPalette`. (Covers AE8.)
- `Cmd-K` while a `dialog[open]` / `data-kbd-popover-open` overlay is present does NOT call `openPalette`. (Covers AE6, R2.)
- `Cmd-K` on mobile viewports does nothing (inherits the desktop gate).
- Bare `k` still maps to nothing (regression: the intent-mapper is unchanged).
- The cheatsheet lists the `Cmd-K` binding and still omits the deferred `/`.

**Verification:** The palette opens on the chord from anywhere on desktop, stands down for other overlays, and the keymap advertises it; Phase 1 behavior is unregressed.

---

## System-Wide Impact

- **Provider graph:** one new provider (`CommandPaletteProvider`) in `Layout`, inside Capture + Cursor providers; `KeyboardCheatsheet` moves from `KeyboardLayer` into it. `KeyboardLayer` shrinks to the hook call.
- **Cursor contract:** `KeyboardCursor` gains `requestFocus`; existing consumers are unaffected (additive). The pending-target branch in `registerList` must not regress the deletion-anchor / context-switch logic.
- **Keyboard hook:** gains a modifier-chord branch and a second consumed context (`useCommandPalette`) alongside `useKeyboardCursor` and `useCapture`. The pure intent-mapper is unchanged (chord handled outside it).
- **Settings:** `handleExport` is routed through the new `exportData`; no user-visible change.
- **Overlay coexistence:** three centered/anchored overlays now exist (QuickAdd dialog, `:` bar, palette) plus the cheatsheet; `isBlockingOverlayOpen()` keeps only one keyboard owner at a time.
- **Unchanged invariants:** data model (no schema change, no migration), mouse flows, Phase 1 navigation/cursor, Phase 2 capture, demo layout (palette mounts in `Layout`, not `demo-layout`).

---

## Risks & Dependencies

| Risk                                                                                                                                      | Mitigation                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-view targeting misses when the destination view does not render the target row (e.g., a detail view filtered by month or paginated) | Verify during U7 whether category detail renders recent expenses unconditionally; if it filters, the cursor simply does not land (benign no-op). If recent expenses are routinely filtered out, fall back to navigation-only for those, or set the relevant filter — decide at implementation against the real view. |
| `Cmd-K` collides with a browser/OS shortcut                                                                                               | `Cmd-K`/`Ctrl-K` is not a critical browser binding in the target desktop browsers; `preventDefault` on handling. Verify in-browser per CLAUDE.md.                                                                                                                                                                    |
| Loading both routes' categories + panels + recent expenses adds provider work                                                             | Data is small (a personal expense app); load lazily/once like `CaptureProvider`; recent expenses are capped at 50.                                                                                                                                                                                                   |
| Modifier-chord branch firing inside fields could swallow a real `Cmd-K` text affordance                                                   | There is no app text affordance on `Cmd-K`; the branch only triggers the palette and stands down when another overlay owns input.                                                                                                                                                                                    |
| Depends on Phase 1 (intent-mapper, gate, cursor, `isBlockingOverlayOpen`) and Phase 2 (CaptureProvider, QuickAdd)                         | All on `feat/vim-keyboard-shortcuts`; build Phase 3 on that branch.                                                                                                                                                                                                                                                  |

---

## Scope Boundaries

### Deferred for later

- Sign out, quick-create (New panel / Add category), archived-panel toggle — cut from the action set.
- Command history, frecency, pinned/favorite commands — empty-state default set is fixed.
- Acting on a result without leaving the palette — selection always navigates/runs then closes.
- Month scrub / jump-to-month — Phase 4.

### Outside this product's identity

- Mobile/touch — inherits the desktop-only gate.
- Demo-persona parity — deferred alongside Phases 1–2.
- A general extensible/plugin command registry — the action set is a fixed curated list.

### Deferred to Follow-Up Work

- None.

---

## Verification

- All new pure modules (fuzzy matcher, query, `requestFocus`, `exportData`) are unit-tested; the palette component and provider have RTL tests; AE1–AE8 are each covered by a named scenario.
- Full suite green (`npx vitest run --environment jsdom`), `tsc -b` clean, `npx prettier --check .` clean before pushing to PR #7.
- Manual browser check (per CLAUDE.md): `Cmd-K` opens the palette from a list view, from within a focused field, and is suppressed while QuickAdd / the `:` bar is open; selecting a recent expense lands the cursor on its row in the detail view.

---

## Deferred to Implementation

- Exact fuzzy scoring weights (contiguity vs word-start bonuses) — tune against real category/panel/expense names during U1.
- The precise `getRecentExpenses` join columns and whether `category_name` is needed for display vs derivable — settle against the real schema in U2.
- Whether `CommandPalette` is best built on the existing `Modal` (`<dialog>`) or a bespoke centered panel — decide in U6 against focus-trap/scroll behavior.
- The recent-expense filtered-view edge (see Risks) — verify the category detail view's rendering in U7.
