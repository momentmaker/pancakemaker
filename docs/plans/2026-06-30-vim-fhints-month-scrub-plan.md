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
- **`FHintProvider` owns f-mode** (mirrors `CaptureProvider`/`CommandPaletteProvider`, mounted in `Layout`): holds `active` state, snapshots + labels fully-in-viewport targets on open (early-returns if none), renders the badge overlay (marked `data-kbd-popover-open` so the global shortcut layer stands down; `role="dialog"` + `aria-label`, `aria-hidden` badges; blurs the active element on open so focused-element handlers can't fire), and attaches its own `keydown` listener to read labels — a match activates + exits, a non-match / `Esc` / **any scroll** exits silently. Exposes `openFHints()`.
- **`MonthScrubProvider` mirrors the cursor's registration.** A view with a month picker calls `useMonthScrub((delta) => setMonth((m) => addMonths(m, delta)))` to register its handler while mounted (functional updater — stale-safe; the context read is optional-chained so the provider-less demo layout doesn't crash); the provider exposes `scrub(delta)`. `[`/`]` dispatch to `scrub(-1)`/`scrub(+1)`, a no-op when nothing is registered. Unbounded, matching the picker arrows.
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
CategoryDetail mounts -> useMonthScrub(d => setMonth(m => addMonths(m, d)))  # registers (functional updater)
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

**Approach:** Add `activateItem(id: string)` to `KeyboardCursor`: find the item in `itemsRef` by id and invoke its `open?.()` (the same callback `open()` runs for the active item). It does not need to move the cursor first. Keep it stable in the memoized value. This is the seam f-hints use to "open" cards/rows without duplicating navigate/`startEdit` logic. When no item matches the id, no-op — but emit a **dev-only `console.warn`** so a future divergence (a marked DOM element with no registered cursor item) surfaces during development rather than silently doing nothing.
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

**Approach:** Mirror `KeyboardCursorProvider`. The provider holds a `handlerRef` and exposes `scrub(delta: number)` (calls the handler if registered, else no-op) and `register(handler | null)`. `useMonthScrub(handler)` registers on mount via a stable effect (same stable-callback discipline as `useListCursor` to avoid cleanup churn) and clears on unmount. **`useMonthScrub` must read the context with optional chaining** (`register?.(...)`, no-op when the context is null) exactly like `useListCursor` does — the 4 picker views also render under `demo-layout.tsx`, which mounts **none** of the keyboard providers, so an unguarded `useContext(...).register(...)` would crash every demo route on mount. Each picker view calls `useMonthScrub((delta) => setMonth((m) => addMonths(m, delta)))` — **mandate the functional-updater form** (`m => addMonths(m, delta)`); a closure over the rendered `month` would scrub relative to a stale value once registration is mount-stable. Reuse `addMonths` (lift it to a shared util, or each view passes its own handler). **RouteView's `MonthPicker` is tab-conditional** (only the Categories tab renders it; the Panels tab has no picker but holds `month` state) — gate its registration on `activeTab === 'categories'` so `[`/`]` no-op on the Panels tab rather than silently mutating a hidden month. Unbounded (matches the picker). A view with no active registration leaves the handler null → `scrub` is a no-op (R8).
**Patterns to follow:** `apps/web/src/hooks/useKeyboardCursor.tsx` (provider + registration hook + **optional-chained context read** + stable callback); `MonthPicker`'s `addMonths`.
**Test scenarios:**

- `scrub(+1)` with a registered handler calls it with `+1`; `scrub(-1)` with `-1`. (Covers AE6.)
- `scrub(±1)` with no registered handler is a no-op (no throw). (Covers AE7/R8.)
- A picker view renders **without** a `MonthScrubProvider` ancestor (the demo-layout case) and does not throw on mount.
- The registered handler uses the functional updater: after `scrub(+1)` then `scrub(-1)`, the view's month returns to where it started (no stale-closure drift).
- Unmounting the registering component clears the handler so a later `scrub` no-ops.

**Verification:** `[`/`]` reach exactly the active view's month, are stale-safe, no-op where no picker is active, and never crash the provider-less demo layout.

### U4. FHintProvider + overlay + target markers

**Goal:** f-mode: snapshot visible targets, badge them, capture keystrokes, activate on label.
**Requirements:** R1, R2, R3, R4, R5
**Dependencies:** U1 (labels), U2 (activation)
**Files:**

- Create: `apps/web/src/hooks/useFHints.tsx` (`FHintProvider`, `useFHints`, exported `FHintContext`)
- Create: `apps/web/src/components/FHintOverlay.tsx`
- Create: `apps/web/src/hooks/useFHints.test.tsx` and/or `apps/web/src/components/FHintOverlay.test.tsx`
- Modify: `apps/web/src/components/Layout.tsx` (nav links get `data-fhint`), and the enumerated primary-action buttons get `data-fhint`: RouteView "New Panel"; the Add-expense trigger on Dashboard / RouteView / CategoryDetail / PanelDetail; Settings "Export CSV" and "Export JSON". Utility chrome (sync indicator, install, GitHub link) and secondary buttons (Cancel, etc.) are **not** marked.

**Approach:** `FHintProvider` owns `active` + the current labelled-target list and exposes `openFHints()`. On open: query `document` for `[data-kbd-item-id], [data-fhint]` and keep only those **fully within the viewport** — `rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth` and non-zero size (a strict, unambiguous predicate; no partial-visibility exception). Order by position (U1), assign labels (U1), store `{ label, element, id|null, rect }`. **If zero targets qualify, do not enter f-mode** (early return — no overlay, no listener; pressing `f` on an empty view is a silent no-op, not an empty/flickering overlay).

Render `FHintOverlay` — a fixed-position layer marked `data-kbd-popover-open` (so the global shortcut hook stands down) with a badge per target. **Badge anchor + visual:** anchor each badge to the **top-left of its target rect, inset a few px** so it sits inside the target (not over an adjacent badge — this keeps the horizontally-dense nav-link row from colliding); style with existing tokens (e.g. `bg-bg-primary/90 text-neon-cyan border border-neon-cyan/50 font-mono text-xs`, ~`18–20px`) for contrast across the neon-dark theme and varied card colors. **Badges are `aria-hidden`** (purely visual transient labels).

**Accessibility + focus (mirror the peer overlays, which all specify ARIA):** the overlay root carries `role="dialog"` + an `aria-label` (e.g. "Hint mode — press a highlighted key"). On open, **blur `document.activeElement`** (and/or move focus to the overlay root) so a previously-focused element's own handlers — e.g. a cursor-focused `Card`'s Enter→navigate — cannot fire during f-mode; restore is unnecessary since activation navigates/opens and a silent exit returns to the prior view state.

**Key capture:** attach a `keydown` listener while active — a key matching a label activates that target (`id ? cursor.activateItem(id) : element.click()`) then exits; `Esc` or any non-matching key exits silently. **Exit f-mode on any `scroll` event** (a scroll listener calling the close path) rather than leaving stale badges floating over moved targets — the snapshot is only valid until the layout moves; re-press `f` to re-snapshot. Utility chrome is never marked, so it is never badged (R2).
**Patterns to follow:** `apps/web/src/hooks/useCapture.tsx` / `useCommandPalette.tsx` (provider shape, exported context, renders its own overlay); `apps/web/src/components/CaptureBar.tsx` (`data-kbd-popover-open`, key handling); `apps/web/src/lib/keyboard/dom.ts` (`KBD_ITEM_ATTR`).
**Test scenarios:**

- With a container of marked targets in the DOM, `openFHints()` renders one badge per visible target with home-row-first labels. (Covers AE1.)
- Typing a badge's label calls `cursor.activateItem(id)` for a `data-kbd-item-id` target and `element.click()` for a `data-fhint` target, then clears the overlay. (Covers AE1, AE2, AE3, R4 — assert via spies / a click spy.)
- A non-matching key clears the overlay with no activation; `Esc` does the same. (Covers AE4/R5.)
- An element outside the viewport (mock `getBoundingClientRect` off-screen / partially off) gets no badge — only fully-in-viewport targets are badged. (Covers R3 viewport-only.)
- An unmarked element (utility chrome with neither `data-kbd-item-id` nor `data-fhint`) is never queried and receives no badge. (Covers AE5/R2.)
- With zero qualifying targets, `openFHints()` does not enter f-mode (no overlay rendered, no listener attached). (Covers the empty-state decision.)
- A `scroll` event while f-mode is open exits f-mode (no stale badges).
- On open, `document.activeElement` is blurred so a previously-focused element's handlers do not fire; badges carry `aria-hidden`, and the overlay root carries `role="dialog"` + an `aria-label`.
- The overlay root carries `data-kbd-popover-open`. (Covers R5 stand-down mechanics.)
- More targets than the label pool → only pool-many badges render. (Covers R3 overflow.)

**Verification:** f-mode badges only the fully-visible marked targets, activates the right one per type, exposes the a11y contract, exits on scroll/mistype/`Esc`, and never enters on an empty view.

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
- With a pending `g` prefix, `[` / `]` / `f` resolve to `none` and clear the pending prefix (documents the swallow decision — consistent with existing `gj` behavior).
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

| Risk                                                                                                                                                    | Mitigation                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Badge positioning drifts from targets (scroll/layout shift between open and a keypress)                                                                 | Snapshot rects at open; **exit f-mode on any scroll event** so badges never float over moved targets — re-press `f` to re-snapshot. Verify positioning in-browser per CLAUDE.md.                                                                                |
| Snapshot goes stale if the active view re-renders mid-f-mode (async data load adds/removes targets)                                                     | Low likelihood (data is usually settled before `f`); degrades gracefully (a removed target's `.click()`/`activateItem` no-ops). Acceptable; re-snapshot-on-re-render is deferred.                                                                               |
| `getBoundingClientRect` / `innerHeight` visibility checks behave differently under jsdom (layout is not computed)                                       | Unit-test the discovery/label logic by mocking `getBoundingClientRect`; verify real positioning/visibility in-browser.                                                                                                                                          |
| Activating a `data-kbd-item-id` target whose view did not register it with the cursor (id present in DOM but not in `itemsRef`) → `activateItem` no-ops | Acceptable graceful no-op; the current 4 views register exactly their on-screen cards/rows. Add a **dev-only `console.warn`** in `activateItem` when an id has a matching DOM element but no registered item, so future divergence surfaces during development. |
| `f` collides with nothing, but `[` / `]` are also used by browsers?                                                                                     | `[`/`]` are not browser shortcuts; `preventDefault` on handling. Verify in-browser.                                                                                                                                                                             |
| Depends on Phase 1 (intent-mapper, gate, cursor, `isBlockingOverlayOpen`, `data-kbd-item-id`), Phase 2, Phase 3                                         | All on `feat/vim-keyboard-shortcuts`; build Phase 4 on that branch.                                                                                                                                                                                             |

---

## Scope Boundaries

### Deferred for later

- Multi-letter hint sequences for views exceeding the single-letter pool — overflow is unbadged.
- Hinting off-screen / virtualized targets — viewport snapshot only.
- Re-snapshotting badges on scroll/resize while f-mode is open — instead, **a scroll exits f-mode** (decided); re-tracking is deferred.
- A background dimming scrim — badges only.
- Month-scrub bounds — unbounded, matching the picker.
- Screen-reader announcement of month changes (`aria-live` on the picker label) — out for now; the visible label updates.

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

- Final badge pixel offsets/sizing against the real DOM (the predicate — fully-in-viewport — and styling tokens are decided in U4; only the exact spacing is left to in-browser tuning).
- Whether `addMonths` is lifted to a shared util or each view passes its own scrub handler — decide in U3.
- Label-pool tail beyond the home row (exact letter order) — finalize in U1 against readability.
- Whether a pending `g`/`y` prefix should swallow the first `f`/`[`/`]` (current intent-mapper behavior, consistent with `gj`) or be made pending-proof like `Cmd-K` — make it an explicit, tested decision in U5 (default: accept the swallow; add an intents test documenting it).
