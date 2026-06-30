---
date: 2026-06-30
title: 'feat: Vim f-hints + month scrub (Phase 4)'
type: feat
status: active
origin: docs/brainstorms/vim-fhints-month-scrub-requirements.md
---

# feat: Vim f-hints + month scrub (Phase 4)

## Summary

Add the final two desktop-only vim shortcuts to pancakemaker. **f-hints:** `f` overlays single-letter badges on the visible navigable/actionable targets (nav links, cards, expense rows, primary action buttons); typing a target's letter activates it and exits; a mistype or `Esc` exits silently. **Month scrub:** `[` / `]` move the current view's month back/forward, driving the existing `MonthPicker`.

Activation reuses what already exists: for `data-kbd-item-id` targets (cards, expense rows) the keyboard cursor already knows how to "open" each (navigate for a card, `startEdit` for a row), so f-hints route through a new `cursor.activateItem(id)`; nav links and buttons are plain DOM, tagged with a new `data-fhint` marker and activated with a native `.click()`. f-mode lives in a transient `FHintProvider` (mirroring `CaptureProvider`/`CommandPaletteProvider`) that owns a badge overlay and captures keystrokes while open; `[`/`]` reach the active view's `setMonth` via a `MonthScrubProvider` registration that mirrors `KeyboardCursorProvider`.

Realizes R20–R21 of the origin roadmap and resolves the f-hint target-set/discovery questions it deferred (see origin: [docs/brainstorms/vim-fhints-month-scrub-requirements.md](docs/brainstorms/vim-fhints-month-scrub-requirements.md); roadmap [docs/plans/2026-06-26-vim-keyboard-shortcuts-plan.md](docs/plans/2026-06-26-vim-keyboard-shortcuts-plan.md), unit U9).

---

## Requirements Trace

- **R1** `f` enters f-hint mode, badging visible targets → U4, U5
- **R2** Target set = nav links + cards + expense rows + primary action buttons; utility chrome excluded → U4
- **R3** Single-letter home-row-first labels; viewport-only; overflow unbadged → U1, U4
- **R4** Typing a label activates (nav navigate · card open · row open/edit · button click) → U2, U4
- **R5** Transient key-capturing overlay; mistype / `Esc` exits silently → U4
- **R6** `f` desktop-only; stands down for fields/overlays → U5
- **R7** `[` / `]` move the current view's month via `MonthPicker`, on the 4 picker views → U3, U5
- **R8** Month scrub unbounded; silent no-op where no picker exists → U3, U5
- **R9** `[` / `]` desktop-only; stand down for fields/overlays → U5

Acceptance Examples AE1–AE8 are carried into the unit test scenarios (`Covers AE<N>.`).

---

## Key Technical Decisions

- **Activation is heterogeneous under a uniform feel.** `data-kbd-item-id` targets (cards, expense rows) activate through the cursor's already-registered per-item `open` — a card navigates, an expense row `startEdit`s — via a new `cursor.activateItem(id)`. Nav links and primary buttons are natively clickable DOM, so they carry a new `data-fhint` marker and activate with `element.click()`. This avoids changing `ExpenseRow`'s mouse behavior (its root is intentionally not click-to-edit) and reuses the cursor's open semantics instead of duplicating them.
- **Discovery = a viewport-filtered DOM query, not a per-component registry.** When f-mode opens, query the document for visible `[data-kbd-item-id], [data-fhint]` elements and filter to those whose bounding rect is within the viewport. Reuses the existing `data-kbd-item-id` markers on `Card`/`ExpenseRow`; only nav links and the chosen action buttons need the new `data-fhint` marker. A live snapshot at open-time sidesteps React-render/virtualization coupling — whatever is on screen when you press `f` is what gets badged.
- **Single-letter, home-row-first labels assigned by on-screen position.** A pure label pool (`a s d f g h j k l` then the rest of the alphabet, minus none — in f-mode every key is a label, not a binding) is assigned to visible targets ordered top-to-bottom, left-to-right. If targets exceed the pool, the overflow is unbadged. Pure and unit-tested.
- **`FHintProvider` owns f-mode** (mirrors `CaptureProvider`/`CommandPaletteProvider`, mounted in `Layout`): holds `active` state, snapshots + labels targets on open, renders the badge overlay (marked `data-kbd-popover-open` so the global shortcut layer stands down), and attaches its own `keydown` listener to read labels — a match activates + exits, a non-match or `Esc` exits silently. Exposes `openFHints()`.
- **`MonthScrubProvider` mirrors the cursor's registration.** A view with a month picker calls `useMonthScrub(delta => setMonth(addMonths(month, delta)))` to register its handler while mounted; the provider exposes `scrub(delta)`. `[`/`]` dispatch to `scrub(-1)`/`scrub(+1)`, a no-op when nothing is registered. Unbounded, matching the picker arrows.
- **Three new bare-key intents** (`open-fhints`, `month-prev`, `month-next`) on the pure intent-mapper; the keyboard hook dispatches them, consuming the two new contexts via latest-value refs (the Phase 2/3 pattern). The intent-mapper's field-focus suppression and the hook's `isBlockingOverlayOpen` guard give R6/R9 for free.

---

## High-Level Technical Design

_Directional guidance for review, not implementation specification._

Provider graph (Layout) — both new providers sit beside the Phase 2/3 ones, around `KeyboardLayer`:

```
CaptureProvider
  KeyboardCursorProvider            # gains activateItem(id)
    CommandPaletteProvider
      MonthScrubProvider            # NEW: register(handler) / scrub(delta)
        FHintProvider               # NEW: openFHints(); owns the badge overlay
          KeyboardLayer             # useKeyboardShortcuts dispatches f / [ / ]
          <FHintOverlay/>           # NEW (rendered by FHintProvider when active)
          <Outlet/>                 # views register month-scrub; mark data-fhint
```

f-hint flow:

```
press f (global hook, no field/overlay) -> fhint.openFHints()
  FHintProvider snapshots visible [data-kbd-item-id],[data-fhint] -> assigns labels -> renders badges
  (overlay sets data-kbd-popover-open -> global shortcuts stand down)
  keydown 'g' -> match target g ->
      target has data-kbd-item-id ? cursor.activateItem(id)   # navigate / startEdit
                                  : element.click()            # nav link / button
      -> exit f-mode
  keydown with no match, or Esc -> exit silently
```

Month scrub:

```
CategoryDetail mounts -> useMonthScrub(d => setMonth(addMonths(month, d)))  # registers
press ] (global hook) -> monthScrub.scrub(+1) -> registered handler -> setMonth(next)
press [ on Settings (no registration) -> scrub(-1) is a no-op
```

---

## Implementation Units

### U1. Pure f-hint label helpers

**Goal:** A pure, DOM-free module that produces hint labels and orders targets deterministically.
**Requirements:** R3
**Dependencies:** none
**Files:**

- Create: `apps/web/src/lib/keyboard/fhints.ts`
- Create: `apps/web/src/lib/keyboard/fhints.test.ts`

**Approach:** Export the label pool (home-row first: `a s d f g h j k l`, then the remaining letters) and `assignLabels(count: number): string[]` returning the first `count` labels (empty beyond the pool). Export `orderByPosition(rects)` — given each target's `{ id, top, left }`, return indices ordered top-to-bottom then left-to-right — so label assignment is deterministic and reads naturally. Keep all non-DOM logic here, in the spirit of `lib/keyboard/capture.ts`.
**Patterns to follow:** `apps/web/src/lib/keyboard/capture.ts` / `capture.test.ts` (pure module + plain-vitest).
**Test scenarios:**

- `assignLabels(3)` → `['a','s','d']`; home-row letters come first.
- `assignLabels(0)` → `[]`; requesting more than the pool returns exactly the pool (no throw, overflow simply absent). (Covers R3 overflow.)
- `orderByPosition` sorts top-to-bottom, then left-to-right for equal tops; stable for identical positions.

**Verification:** Label/order behavior fully determined by unit tests; no DOM.

### U2. `cursor.activateItem(id)`

**Goal:** Let a caller activate a cursor-registered item by id, reusing its registered `open` (navigate for a card, `startEdit` for a row).
**Requirements:** R4
**Dependencies:** none
**Files:**

- Modify: `apps/web/src/hooks/useKeyboardCursor.tsx` (add `activateItem`)
- Modify: `apps/web/src/hooks/useKeyboardCursor.test.tsx`

**Approach:** Add `activateItem(id: string)` to `KeyboardCursor`: find the item in `itemsRef` by id and invoke its `open?.()` (the same callback `open()` runs for the active item). It does not need to move the cursor first. Keep it stable in the memoized value. This is the seam f-hints use to "open" cards/rows without duplicating navigate/`startEdit` logic.
**Patterns to follow:** the existing `runAction`/`open` and `requestFocus` additions in the same file.
**Test scenarios:**

- After `registerList([{id:'a', open: spyA}, ...])`, `activateItem('a')` calls `spyA` once and does not change `activeId`.
- `activateItem('missing')` is a no-op (no throw).
- Regression: `open()` on the active item still works unchanged.

**Verification:** `activateItem(id)` runs the right item's open callback; existing cursor behavior unregressed.

### U3. MonthScrubProvider + `useMonthScrub`

**Goal:** A registration seam so the global keyboard layer can move the active view's month.
**Requirements:** R7, R8
**Dependencies:** none
**Files:**

- Create: `apps/web/src/hooks/useMonthScrub.tsx` (`MonthScrubProvider`, `useMonthScrub`, exported `MonthScrubContext` for tests)
- Create: `apps/web/src/hooks/useMonthScrub.test.tsx`
- Modify: `apps/web/src/views/Dashboard.tsx`, `apps/web/src/views/RouteView.tsx`, `apps/web/src/views/CategoryDetail.tsx`, `apps/web/src/views/PanelDetail.tsx` (register their month handler)

**Approach:** Mirror `KeyboardCursorProvider`. The provider holds a `handlerRef` and exposes `scrub(delta: number)` (calls the handler if registered, else no-op) and `register(handler | null)`. `useMonthScrub(handler)` registers on mount via a stable effect (same stable-callback discipline as `useListCursor` to avoid cleanup churn) and clears on unmount. Each of the 4 picker views calls `useMonthScrub((delta) => setMonth((m) => addMonths(m, delta)))` — reusing the `addMonths` helper (lift it to a shared spot or each view passes its own). Unbounded (matches the picker). A view with no `useMonthScrub` call leaves the handler null → `scrub` is a no-op (R8).
**Patterns to follow:** `apps/web/src/hooks/useKeyboardCursor.tsx` (provider + registration hook + stable callback); `MonthPicker`'s `addMonths`.
**Test scenarios:**

- `scrub(+1)` with a registered handler calls it with `+1`; `scrub(-1)` with `-1`. (Covers AE6.)
- `scrub(±1)` with no registered handler is a no-op (no throw). (Covers AE7/R8.)
- Unmounting the registering component clears the handler so a later `scrub` no-ops.
- A view registered with `setMonth` actually advances its month when `scrub(+1)` runs (integration, one view).

**Verification:** `[`/`]` reach exactly the active view's month; no-op elsewhere.

### U4. FHintProvider + overlay + target markers

**Goal:** f-mode: snapshot visible targets, badge them, capture keystrokes, activate on label.
**Requirements:** R1, R2, R3, R4, R5
**Dependencies:** U1 (labels), U2 (activation)
**Files:**

- Create: `apps/web/src/hooks/useFHints.tsx` (`FHintProvider`, `useFHints`, exported `FHintContext`)
- Create: `apps/web/src/components/FHintOverlay.tsx`
- Create: `apps/web/src/hooks/useFHints.test.tsx` and/or `apps/web/src/components/FHintOverlay.test.tsx`
- Modify: `apps/web/src/components/Layout.tsx` (nav links get `data-fhint`), and the primary-action button sites (e.g., `apps/web/src/views/RouteView.tsx` "New Panel", the Add-expense trigger, `apps/web/src/views/Settings.tsx` export buttons) get `data-fhint`

**Approach:** `FHintProvider` owns `active` + the current labelled-target list and exposes `openFHints()`. On open: query `document` for visible `[data-kbd-item-id], [data-fhint]`, filter to in-viewport via `getBoundingClientRect` (top/left within `innerWidth`/`innerHeight`, non-zero size), order by position (U1) and assign labels (U1), store `{ label, element, id|null, rect }`. Render `FHintOverlay` — a fixed-position layer marked `data-kbd-popover-open` (so the global shortcut hook stands down) with a badge absolutely positioned at each target's rect. Attach a `keydown` listener while active: a key matching a label activates that target — `id ? cursor.activateItem(id) : element.click()` — then exits; `Esc` or any non-matching key exits silently (no action). Recompute nothing on scroll/resize (snapshot model); exit if the user scrolls is optional and deferred. Utility chrome is simply never marked, so it is never badged (R2).
**Patterns to follow:** `apps/web/src/hooks/useCapture.tsx` / `useCommandPalette.tsx` (provider shape, exported context, renders its own overlay); `apps/web/src/components/CaptureBar.tsx` (`data-kbd-popover-open`, key handling); `apps/web/src/lib/keyboard/dom.ts` (`KBD_ITEM_ATTR`).
**Test scenarios:**

- With a container of marked targets in the DOM, `openFHints()` renders one badge per visible target with home-row-first labels. (Covers AE1.)
- Typing a badge's label calls `cursor.activateItem(id)` for a `data-kbd-item-id` target and `element.click()` for a `data-fhint` target, then clears the overlay. (Covers AE1, AE2, AE3, R4 — assert via spies / a click spy.)
- A non-matching key clears the overlay with no activation; `Esc` does the same. (Covers AE4/R5.)
- An element outside the viewport (mock `getBoundingClientRect` off-screen) gets no badge. (Covers R3 viewport-only.)
- The overlay root carries `data-kbd-popover-open`. (Covers R5 stand-down mechanics.)
- More targets than the label pool → only pool-many badges render. (Covers R3 overflow.)

**Verification:** f-mode badges the visible targets, activates the right one per type, and always exits cleanly.

### U5. Keyboard integration: intents, dispatch, cheatsheet, Layout mount

**Goal:** Wire `f`, `[`, `]` through the intent-mapper and the keyboard hook, mount both providers, advertise the keys.
**Requirements:** R1, R6, R7, R9
**Dependencies:** U3, U4
**Files:**

- Modify: `apps/web/src/lib/keyboard/intents.ts` (add `open-fhints`, `month-prev`, `month-next` + `f` / `[` / `]` in `SINGLE_KEYS`)
- Modify: `apps/web/src/lib/keyboard/intents.test.ts`
- Modify: `apps/web/src/hooks/useKeyboardShortcuts.ts` (dispatch cases consuming `useFHints` + `useMonthScrub` via latest-value refs)
- Modify: `apps/web/src/hooks/useKeyboardShortcuts.test.tsx`
- Modify: `apps/web/src/components/Layout.tsx` (mount `MonthScrubProvider` + `FHintProvider`)
- Modify: `apps/web/src/lib/keyboard/bindings.ts` (cheatsheet rows) and `apps/web/src/components/KeyboardCheatsheet.test.tsx` if the binding assertion needs it

**Approach:** Add the three `KeyAction`s to the union and `SINGLE_KEYS` (`['f','open-fhints'], ['[','month-prev'], [']','month-next']`); the exhaustive `dispatch` switch then forces wiring (compile error until done). In `useKeyboardShortcuts`, consume `useFHints()` and `useMonthScrub()` via refs (the Phase 2 `captureRef` pattern); dispatch `open-fhints` → `fhintRef.current?.openFHints()`, `month-prev` → `monthRef.current?.scrub(-1)`, `month-next` → `scrub(+1)`; all return `true` (consume the key). Field-focus suppression (resolveIntent) gives R6/R9; the leading `isBlockingOverlayOpen()` guard makes `f`/`[`/`]` stand down while a modal/palette/`:` bar/the f-overlay is open. Mount `MonthScrubProvider` then `FHintProvider` inside the existing provider stack in `Layout`. Add cheatsheet rows for `f` and `[` / `]`.
**Patterns to follow:** the Phase 2/3 dispatch + `captureRef`/`paletteRef` consumption and `isBlockingOverlayOpen` guard in `apps/web/src/hooks/useKeyboardShortcuts.ts`; the exhaustive-switch discipline.
**Test scenarios:**

- `intents`: `f` → `open-fhints`, `[` → `month-prev`, `]` → `month-next`; each suppressed while a field is focused. (Covers R6/R9.)
- `useKeyboardShortcuts`: `f` calls `openFHints` (stub `FHintContext`); `[`/`]` call `scrub(-1)`/`scrub(+1)` (stub `MonthScrubContext`).
- `f`/`[`/`]` do nothing on mobile viewports and while a `dialog[open]` / `data-kbd-popover-open` overlay is present. (Covers AE8/R6/R9.)
- Bare keys unrelated to the new ones still behave as before (regression).
- The cheatsheet lists `f` and `[` / `]` and still omits the deferred `/`.

**Verification:** the three keys dispatch to the providers from anywhere on desktop, stand down for fields/overlays, and are advertised; Phase 1–3 behavior is unregressed.

---

## System-Wide Impact

- **Provider graph:** two new providers (`MonthScrubProvider`, `FHintProvider`) join the Layout stack around `KeyboardLayer`; `FHintProvider` renders the overlay. `KeyboardLayer` gains two more consumed contexts.
- **Cursor contract:** `KeyboardCursor` gains `activateItem` (additive; existing consumers unaffected).
- **Views:** the 4 month-picker views each add one `useMonthScrub` registration; nav links and a handful of action buttons gain a `data-fhint` attribute. No data-model or query changes.
- **Overlay coexistence:** the f-hint overlay is a fourth keyboard-owning surface alongside QuickAdd, the `:` bar, and the palette; `isBlockingOverlayOpen()` keeps one owner at a time, and `f`/`[`/`]` stand down when any is open.
- **Unchanged invariants:** data model (no schema change, no migration), mouse flows (`ExpenseRow` click behavior untouched), Phase 1–3 navigation/capture/palette, demo layout (providers mount in `Layout`, not `demo-layout`).

---

## Risks & Dependencies

| Risk                                                                                                                                                    | Mitigation                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Badge positioning drifts from targets (CSS transforms, scroll between open and paint)                                                                   | Snapshot rects at open and position badges in fixed coordinates; do not track scroll (snapshot model). If the user scrolls, exiting f-mode and re-pressing `f` re-snapshots. Verify positioning in-browser per CLAUDE.md. |
| `getBoundingClientRect` / `innerHeight` visibility checks behave differently under jsdom (layout is not computed)                                       | Unit-test the discovery/label logic by mocking `getBoundingClientRect`; verify real positioning/visibility in-browser.                                                                                                    |
| Activating a `data-kbd-item-id` target whose view did not register it with the cursor (id present in DOM but not in `itemsRef`) → `activateItem` no-ops | Acceptable graceful no-op; in practice the current view registers exactly the on-screen cards/rows. Note as a limitation.                                                                                                 |
| `f` collides with nothing, but `[` / `]` are also used by browsers?                                                                                     | `[`/`]` are not browser shortcuts; `preventDefault` on handling. Verify in-browser.                                                                                                                                       |
| Depends on Phase 1 (intent-mapper, gate, cursor, `isBlockingOverlayOpen`, `data-kbd-item-id`), Phase 2, Phase 3                                         | All on `feat/vim-keyboard-shortcuts`; build Phase 4 on that branch.                                                                                                                                                       |

---

## Scope Boundaries

### Deferred for later

- Multi-letter hint sequences for views exceeding the single-letter pool — overflow is unbadged.
- Hinting off-screen / virtualized targets — viewport snapshot only.
- Re-snapshotting badges on scroll/resize while f-mode is open — snapshot-at-open only.
- A background dimming scrim — badges only.
- Month-scrub bounds — unbounded, matching the picker.

### Outside this product's identity

- Mobile/touch — inherits the desktop-only gate.
- Demo-persona parity — deferred alongside Phases 1–3.
- f-hints over utility chrome (sync/install/GitHub) or browser UI.

### Deferred to Follow-Up Work

- None.

---

## Verification

- Pure helpers (`fhints.ts`), `cursor.activateItem`, and `MonthScrubProvider` are unit-tested; the f-hint provider/overlay and keyboard integration have RTL tests; AE1–AE8 are each covered by a named scenario.
- Full suite green (`npx vitest run --environment jsdom` from `apps/web`), `tsc -b` clean, `npx prettier --check .` clean before pushing to PR #7.
- Manual browser check (per CLAUDE.md): `f` badges the visible nav/cards/rows/buttons and types-to-activate each type correctly; mistype/`Esc` exits; badges sit on their targets; `[`/`]` change the month on each of the 4 picker views and no-op on Settings; all three stand down while a field/modal/palette is active.

---

## Deferred to Implementation

- Exact in-viewport visibility predicate (rect thresholds, partially-visible handling) and badge positioning/styling — settle against the real DOM in U4.
- The precise set of "primary action buttons" to mark with `data-fhint` (New Panel, Add-expense trigger, export, …) — enumerate while wiring U4.
- Whether `addMonths` is lifted to a shared util or each view passes its own scrub handler — decide in U3.
- Label-pool tail beyond the home row (exact letter order) — finalize in U1 against readability.
