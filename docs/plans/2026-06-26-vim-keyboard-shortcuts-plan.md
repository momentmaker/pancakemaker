---
title: "feat: Vim-style desktop keyboard shortcuts"
type: feat
status: active
date: 2026-06-26
origin: docs/brainstorms/vim-keyboard-shortcuts-requirements.md
---

# feat: Vim-style desktop keyboard shortcuts

## Summary

Add a global, desktop-only keyboard-shortcut system to the pancakemaker web app, built on a pure, unit-testable intent-mapper plus a thin React hook mounted in the app shell, with a DOM-driven cursor that reuses the app's existing focusable cards and expense rows. Phase 1 (the engine + list navigation + cheatsheet) is specified to implementation-ready depth; Phases 2–4 (fast capture, command palette, f-hints/month-scrub) are sequenced as a roadmap with their unresolved product questions flagged.

---

## Problem Frame

Pancakemaker is a list-heavy, daily-use expense PWA where every desktop interaction currently routes through the mouse — including the highest-frequency action, logging an expense. A keyboard-first user has no way to navigate or act without reaching for the pointer. The sibling `ypuf` project already validated a hand-rolled vim-shortcut architecture; this plan ports that approach into a React/React-Router app. See origin: [docs/brainstorms/vim-keyboard-shortcuts-requirements.md](docs/brainstorms/vim-keyboard-shortcuts-requirements.md).

---

## Requirements

**Foundation (Phase 1 engine)**
- R1. Shortcuts active only on desktop viewports; inert below the `sm`/640px breakpoint.
- R2. Pure intent-mapper (key + context → action, no DOM) plus a thin React hook owning one global keydown listener; the mapper is the registration point Phases 2–4 extend.
- R3. Never fire while typing in input/textarea/select/contenteditable; only `Esc` honored in that state.
- R4. Stand down while a modal/dialog owns the keyboard; native dialog Escape unaffected.
- R5. Held keys do not repeat-fire mutating actions.
- R6. `?` opens a cheatsheet overlay of active shortcuts; `Esc` closes it with focus restored.

**Phase 1 — Navigation & actions**
- R7. `j`/`k` move a keyboard cursor through the current view's list (cards on route views, expense rows on detail views).
- R8. Cursored item is highlighted and scrolled into view.
- R9. `gg` → first item; `G` → last item.
- R10. `Enter`/`o` opens or edits the cursored item via existing interactions.
- R11. `d` deletes the cursored expense through the existing 2-tap confirm; no new destructive path.
- R12. `yy` duplicates the cursored expense via the existing Duplicate action.
- R13. `/` focuses the current view's filter/search field. *(No such field exists today — see Scope Boundaries → Deferred to Follow-Up Work.)*
- R14. `g`-prefixed route jumps: `gd` Dashboard, `gp` Personal, `gb` Business, `gs` Settings.
- R15. `Esc` clears the keyboard cursor or blurs a focused field.

**Phase 2 — Fast capture** (roadmap)
- R16. `a` opens QuickAdd immediately with the amount autofocused.
- R17. `:` opens a command-line capture bar that parses a short expression into a new expense.

**Phase 3 — Command palette** (roadmap)
- R18. `Cmd-K`/`Ctrl-K` opens a fuzzy command palette.
- R19. Palette jumps to any category/panel/route and runs available actions.

**Phase 4 — f-hints & month scrub** (roadmap)
- R20. `f` enters f-hint mode: letter badges on visible targets; mistype exits silently.
- R21. `[`/`]` move the active list to the previous/next month.

**Origin acceptance examples:** AE1 (covers R3), AE2 (covers R4), AE3 (covers R1), AE4 (covers R11), AE5 (covers R6), AE6 (covers R10), AE7 (covers R5).

---

## Scope Boundaries

- Mobile/touch — shortcuts inert below the desktop breakpoint.
- Numeric counts (`3j`) and strict-vim grammar (mandatory `dd`/`yy`-only delete) — out; pragmatic single-key only.
- No new delete/undo machinery — reuse the existing 2-tap confirm.
- No user-facing remapping/customization UI.
- No third-party hotkey library — hand-rolled per the `ypuf` pattern.

### Deferred to Follow-Up Work

- **R13 `/` focus-filter**: no filter/search field exists in the app today (RouteView has only a `showArchived` toggle). Defer `/` to land with the Phase 3 command palette or a future filter surface, rather than building a filter field in Phase 1.
- **Demo-persona parity**: wiring shortcuts into the demo tree (`apps/web/src/demo/demo-layout.tsx`) is deferred — the origin never scoped demo, and the demo nav is structurally different (persona-prefixed routes built from `useParams`, no Settings route, so `gs` would have no target). Revisit as a follow-up if demo keyboard support is wanted.
- **Phases 2–4 detailed planning**: each becomes its own planning pass once its origin open question is resolved (capture grammar/target, palette index, f-hint target set).

---

## Context & Research

### Relevant Code and Patterns

- **Mount point:** `apps/web/src/components/Layout.tsx` (`Layout`) wraps all primary routes via `<Outlet/>` and is a route element with router context; mounting the hook here naturally excludes `/auth/*` and the demo tree. `navItems` lives here as a module-private const (only `Layout` is exported) and must be extracted into a shared exported table before the hook can consume it.
- **Hook precedent:** `apps/web/src/hooks/useInstallPrompt.ts` — the existing `window`-listener-in-`useEffect`-with-cleanup pattern to mirror. Context-hook precedent: `apps/web/src/sync/SyncContext.tsx` (createContext + Provider + throwing `useX()`).
- **Reuse — rows:** `apps/web/src/components/ExpenseRow.tsx` owns inline edit (Enter/Esc), 2-tap delete (`startConfirm` arms `confirming` + a 3s auto-cancel timer + click-outside cancel; `confirmDelete` commits; `cancelConfirm` cancels), and Duplicate. These are **private** today — no external handle. Parent handlers (`handleUpdateAmount`, `handleUpdateDescription`, `handleDuplicate`, `handleRemove`) exist in `apps/web/src/views/CategoryDetail.tsx` and `apps/web/src/views/PanelDetail.tsx`.
- **Reuse — cards:** `apps/web/src/components/Card.tsx` is already `tabIndex=0`, `role="button"`, Enter-activatable. `CategoryCard.tsx`/`PanelCard.tsx` navigate via `navigate(\`${prefix}/${routeType}/(category|panel)/${id}\`)` through `useRoutePrefix()` (`apps/web/src/demo/demo-context.tsx`).
- **Reuse — lists:** `apps/web/src/views/RouteView.tsx` renders `CategoryCard`/`PanelCard` grids with a `categories|panels` tab toggle and `MonthPicker`. No virtualization anywhere, so a DOM cursor can rely on all visible items being present. `CategoryDetail` has collapsible panels (`collapsedPanels`) that omit collapsed rows from the DOM.
- **Modal & custom popovers:** `apps/web/src/components/Modal.tsx` is a native `<dialog>` using `showModal()`; Escape is native and sets `dialog[open]`. But `PanelActions` (the `…` menu), `FormSelect`, and the `ExpenseRow` delete-confirm are **custom popovers, not native dialogs** — they close on outside `mousedown` and keep focus on a trigger `<button>`, so `dialog[open]` is false and `activeElement` isn't editable. There is no global "is an overlay open" signal — one must be added.
- **QuickAdd:** `apps/web/src/components/QuickAdd.tsx` already `autoFocus`es the amount and resets on the closed→open transition; open-state lives per-view (`showQuickAdd`).

### Institutional Learnings

- No `docs/solutions/` directory or learnings store exists — this would be the first entry. Worth capturing post-Phase-1 (via `/ce-compound`): the stale-closure handling for the long-lived keydown listener, the jsdom `matchMedia`/`showModal` test stubs, and the CSS-only-breakpoint gotcha.

### External References

- None used — local patterns plus the `ypuf` reference (`extension/lib/boardkeys.js` pure intent-mapper + DOM glue) are sufficient. React keydown-hook concerns (subscription cleanup, stale closures) are well-understood.

---

## Key Technical Decisions

- **Mount in `Layout`, not `main.tsx`:** the hook needs router context (`useNavigate`) and should not run on auth/demo routes. `Layout` is the narrowest shell that satisfies both. (Note: `Layout` currently imports only `useSync`; the hook adds `useNavigate` itself.)
- **Pure intent-mapper with a `pending`-prefix context:** multi-key sequences (`gg`, `g`+route) are modeled by passing a `pending` token into the pure mapper and tracking that token's lifecycle in the hook — keeps the mapper a pure, fully-testable function while supporting chords.
- **Key-repeat check runs after the mapper resolves the action:** "mutating" is a property of the resolved action, so the hook resolves the action first, then drops the event if `e.repeat` and the action is mutating (`d`/`yy`). Non-mutating `j`/`k` continue to repeat so held-key scrolling works. The mutating set is derived from the mapper's binding metadata, not a parallel table.
- **Stand-down guard covers native dialogs AND custom popovers:** the global handler bails when `dialog[open]` exists, when `activeElement` is an editable field, OR when an open custom popover (PanelActions, FormSelect, ExpenseRow confirm) is present — those expose a shared open marker (data attribute / body flag) the guard checks, since they are not native dialogs.
- **Esc precedence ladder (highest first):** close an open modal/cheatsheet (native dialog) › cancel an active inline edit › clear the keyboard cursor › blur a focused field. A single `Esc` resolves exactly one level; while editing a field, Esc cancels the edit and does NOT also clear the cursor.
- **New `useIsDesktop` hook centralizing the 640 constant:** no breakpoint hook exists; the constant is centralized so it can't drift from Tailwind's `sm`.
- **Pragmatic single-key bindings reuse the existing 2-tap confirm** (origin decision) — `d` arms then confirms through `ExpenseRow`'s existing flow.
- **ExpenseRow gains an imperative handle** (`forwardRef` + `useImperativeHandle` exposing `startEdit`, `startConfirmDelete`, `confirmDelete`, `cancelConfirm`, and `duplicate`) so the keyboard cursor can drive its existing UX rather than duplicating it. The keyboard layer tracks which row is armed: first `d` arms (`startConfirmDelete`), second `d` on the same row commits (`confirmDelete`), `Esc` while armed cancels (`cancelConfirm`), and moving the cursor (or the row's existing 3s auto-cancel timer firing) disarms — so a second `d` never deletes a different row.

---

## Open Questions

### Resolved During Planning

- *Where does the global handler mount?* → `Layout` (see Key Technical Decisions).
- *How to detect blocking overlays?* → native `dialog[open]` plus a shared open marker on custom popovers (PanelActions/FormSelect/ExpenseRow confirm).
- *Key-repeat guard ordering?* → resolve the action first, then drop repeats only for mutating actions.
- *Esc with multiple consumers?* → the precedence ladder in Key Technical Decisions.
- *Cursor behavior in `CategoryDetail` collapsed panels?* → cursor follows the visible (expanded) set only; collapsed groups are skipped (reversible; auto-expand can be revisited).
- *Does `/` have a target?* → No; not registered in Phase 1 (deferred), so it never shows as a dead cheatsheet key.

### Deferred to Implementation

- Exact imperative-handle method wiring from the detail views.
- The precise shared-open-marker mechanism for custom popovers (data attribute vs body flag vs small context).

### Deferred to Later Phases (origin Outstanding Questions)

- [Phase 2] Capture-target resolution when `:`/`a` fires without route context (Dashboard); capture grammar depth (`#category` tokens, dates, ordering).
- [Phase 3] Command palette index + action set.
- [Phase 4] f-hint target set given React rendering.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
document keydown
   │
   ▼
[hook guards]  isDesktop? ─no→ ignore
   │           dialog[open] OR open custom popover (PanelActions/FormSelect/row-confirm)? ─yes→ ignore
   │           activeElement editable/dropdown? ─yes→ (only Esc passes, per Esc precedence below)
   ▼
intentMapper(key, { pending, fieldFocused }) → actionName | 'none'
   │
   ├─ e.repeat AND action is mutating (d/yy)? ─yes→ ignore   (held j/k keep repeating for scroll)
   │
   ├─ route action (gd/gp/gb/gs) ──────────────→ navigate(prefix + path)
   ├─ overlay action (?) ──────────────────────→ open cheatsheet
   ├─ cursor action (j/k/gg/G) ────────────────→ cursor move + scrollIntoView
   ├─ item action (Enter/o/d/yy) ──────────────→ active item's handler / imperative handle
   └─ escape ──────────────────────────────────→ Esc precedence: close modal/cheatsheet › cancel edit › clear cursor › blur
```

Pending-sequence sketch: a `g` keypress with no pending token sets `pending='g'`; the next key resolves against the mapper with that context (`g`→`gg`/top, `d`→Dashboard, etc.); any non-matching key or a short timeout clears `pending`.

---

## Implementation Units

### U1. `useIsDesktop` media-query hook

**Goal:** Provide a single source of truth for "is this a desktop viewport," gating the whole shortcut system (R1).

**Requirements:** R1

**Dependencies:** None

**Files:**
- Create: `apps/web/src/hooks/useIsDesktop.ts`
- Test: `apps/web/src/hooks/useIsDesktop.test.tsx`

**Approach:**
- Mirror the `window`-listener-in-`useEffect`-with-cleanup pattern from `useInstallPrompt.ts`, querying `(min-width: 640px)` via `matchMedia` and subscribing to changes.
- Centralize the `640` constant so it tracks Tailwind's `sm`.

**Patterns to follow:** `apps/web/src/hooks/useInstallPrompt.ts`.

**Test scenarios:**
- Happy path: matchMedia matches → returns `true`; does not match → returns `false`.
- Edge case: a `change` event flips the match → returned value updates.
- Edge case: listener is removed on unmount (no leak).
- Note: jsdom lacks `matchMedia` — stub `window.matchMedia` in the test.

**Verification:** Hook returns correct desktop state and responds to viewport changes; no listener leak.

---

### U2. Pure intent-mapper

**Goal:** Map `(key, context) → actionName` as a pure, DOM-free function — the registration point all phases extend (R2).

**Requirements:** R2, R3, and the binding definitions for R7, R9, R10, R11, R12, R14, R15

**Dependencies:** None

**Files:**
- Create: `apps/web/src/lib/keyboard/intents.ts`
- Test: `apps/web/src/lib/keyboard/intents.test.ts`

**Approach:**
- Single exported function taking the key and a context object (`{ pending, fieldFocused }`) returning an action name or `'none'`.
- Encode Phase 1 bindings: `j/k`, `gg`/`G`, `o`/`Enter`, `d`, `yy`, `g`+`d/p/b/s`, `?`, `Esc`. `/` is NOT registered in Phase 1 (R13 deferred) so it never appears in the cheatsheet as a dead key; if reintroduced later it must `preventDefault` to avoid the browser's native quick-find.
- When `fieldFocused`, return only `escape` for `Esc`, else `'none'`.
- Tag each mutating action (`d`, `yy`) in the binding metadata so the hook's key-repeat guard can consult the mapper rather than a parallel table.
- Model chords through the `pending` token rather than internal state, keeping the function pure.

**Execution note:** Implement test-first — this is the most testable unit and the contract for everything downstream.

**Patterns to follow:** `ypuf` `extension/lib/boardkeys.js` (intent-mapper shape).

**Test scenarios:**
- Happy path: each Phase 1 key maps to its expected action with empty `pending`.
- Happy path (chords): `g` then `g` → top; `g` then `d/p/b/s` → the four route actions.
- Edge case: unknown key (including `/`) → `'none'`.
- Covers AE1 / R3: `fieldFocused: true` returns `escape` for `Esc` and `'none'` for `j`/`d`/etc.
- Edge case: `pending='g'` + non-sequence key → `'none'` (and caller clears pending).
- Metadata: `d` and `yy` report as mutating; `j`/`k` report as non-mutating.

**Verification:** Every Phase 1 binding and chord resolves correctly; field-focus context suppresses all non-Esc actions; mutating flags are queryable.

---

### U3. Global keyboard hook, guards, and route navigation

**Goal:** Own the single document keydown listener, apply all guards, manage pending-sequence state, and dispatch the non-cursor actions (route jumps, cheatsheet open, Esc). Mounted in the app shell (R2, R3, R4, R5, R14, R15; R1 via U1).

**Requirements:** R1, R2, R3, R4, R5, R14, R15

**Dependencies:** U1, U2

**Files:**
- Create: `apps/web/src/hooks/useKeyboardShortcuts.ts`
- Create: `apps/web/src/hooks/useKeyboardShortcuts.test.tsx`
- Modify: `apps/web/src/components/Layout.tsx` (call the hook; extract `navItems` into a shared exported table)

**Approach:**
- Attach one `document` keydown listener in `useEffect` with cleanup; keep the handler stable and read latest state via refs to avoid stale closures in the long-lived listener.
- Guards in order: bail if `!isDesktop`; bail if a blocking overlay is open — native `dialog[open]` OR an open custom popover (PanelActions menu, FormSelect, ExpenseRow confirm), which are not native dialogs and keep focus on a button, so each must expose a shared open marker the guard can check; if `activeElement` is editable/inside a dropdown, only allow `Esc`.
- Resolve the action via the mapper first, THEN drop the event if `e.repeat` and the resolved action is mutating (`d`/`yy`); non-mutating `j`/`k` continue to repeat so held-key scrolling works.
- Track `pending` token for chords with a short auto-clear.
- Esc precedence (highest first): close an open modal/cheatsheet (native dialog) › cancel an active inline edit › clear the keyboard cursor › blur a focused field. A single `Esc` resolves exactly one level.
- Dispatch route actions via `navigate(prefix + navItem.path)` using the shared exported `navItems` table (extracted from `Layout.tsx`) and `useRoutePrefix()`; dispatch `?`→open cheatsheet (U4).

**Execution note:** Start with a failing test for the guard contract (field-focused and overlay-open suppression) before wiring dispatch.

**Patterns to follow:** listener+cleanup convention in `ExpenseRow.tsx`/`SyncIndicator.tsx`; `navItems` + `useRoutePrefix()` in `Layout.tsx`.

**Test scenarios:**
- Covers AE3 / R1: mobile viewport (stubbed) → no action fires for any key.
- Covers AE1 / R3: focus an input → `j` does not navigate; `Esc` blurs.
- Covers AE2 / R4: a `dialog[open]` present → `d`/`j` suppressed.
- Edge case: an open custom popover (marker present) → `d`/`j` suppressed even though `dialog[open]` is false and focus is on a button.
- Covers AE7 / R5: held `d` (`repeat: true`) → delete does not repeat-fire; held `j` still moves the cursor.
- Happy path R14: `g` then `p` navigates to `/personal`.
- Edge case: `pending` clears after timeout / non-matching key.
- Integration: hook mounted via `renderWithProviders` at `/personal` dispatches navigation through the real router.

**Verification:** All guards hold (including custom-popover suppression); the repeat-guard blocks held-`d` but not held-`j`; route chords navigate correctly; Esc resolves exactly one precedence level; no listener leak or stale-closure bug.

---

### U4. Cheatsheet overlay

**Goal:** `?` opens an overlay listing active shortcuts; `Esc` closes it with focus restored (R6).

**Requirements:** R6

**Dependencies:** U3

**Files:**
- Create: `apps/web/src/components/KeyboardCheatsheet.tsx`
- Create: `apps/web/src/components/KeyboardCheatsheet.test.tsx`
- Modify: `apps/web/src/components/Layout.tsx` (render overlay + open-state wiring)

**Approach:**
- Build on the existing native-`<dialog>` `Modal` so focus-trap, native Escape, and focus restoration come for free.
- Source the binding list from a shared definition so it cannot drift from U2's mapper (and so deferred/unregistered keys like `/` never appear).

**Patterns to follow:** `apps/web/src/components/Modal.tsx`.

**Test scenarios:**
- Covers AE5 / R6: pressing `?` shows the overlay; `Esc` closes it.
- Happy path: the overlay lists the Phase 1 bindings and does not list `/`.
- Note: jsdom lacks `<dialog>.showModal()` — assert on open-state/`dialog[open]` per the repo's existing Modal handling.

**Verification:** Cheatsheet opens on `?`, closes on `Esc`, and lists current (registered) bindings only.

---

### U5. Keyboard cursor primitive + route-view card navigation

**Goal:** Introduce the cursor primitive (highlight + `scrollIntoView`, `j/k/gg/G`) and wire it to `CategoryCard`/`PanelCard` lists with `Enter`/`o` to open (R7, R8, R9, R10 for cards).

**Requirements:** R7, R8, R9, R10

**Dependencies:** U3

> **Design note:** the cursor's focus model, identity/anchoring model, and the listener↔view connective mechanism are open architectural decisions captured under **Deferred / Open Questions → From 2026-06-26 review**. Resolve those three together before building this unit — they define how the cursor system works.

**Files:**
- Create: `apps/web/src/hooks/useListCursor.ts`
- Create: `apps/web/src/hooks/useListCursor.test.tsx`
- Create/Modify: cursor highlight style (`apps/web/src/styles/` — `.kbd-cursor`)
- Modify: `apps/web/src/views/RouteView.tsx` (expose the active card list to the cursor; open cursored card)
- Modify: `apps/web/src/components/Card.tsx` if a cursor marker/attribute is needed

**Approach:**
- Cursor tracks the active list's items; `j/k` move it, `gg/G` jump to ends, applying `.kbd-cursor` and `scrollIntoView({ block: 'nearest' })`.
- `Enter`/`o` triggers the cursored card's existing navigate target (respecting `useRoutePrefix()` and the active `categories|panels` tab).
- Cursor reanchors when the list changes (tab switch, month change) — exact identity/anchoring rule per the deferred design decision.

**Patterns to follow:** card focusability in `Card.tsx`; `ypuf` cursor + `scrollIntoView` behavior.

**Test scenarios:**
- Happy path R7/R8: `j`/`k` move the cursor; highlight + scroll applied to the right item.
- Happy path R9: `gg`/`G` jump to first/last.
- Covers AE6 / R10: with a card cursored, `Enter` navigates to that category's detail.
- Edge case: empty list → cursor no-ops; switching tabs reanchors the cursor.
- Integration: rendered RouteView, `j` then `Enter` lands on the correct detail route.

**Verification:** Cursor moves and highlights correctly across cards; opening the cursored card navigates to the right route under normal and demo prefixes.

---

### U6. ExpenseRow imperative handle + detail-view row actions

**Goal:** Expose `ExpenseRow`'s edit/delete/duplicate imperatively and wire the cursor + `Enter`/`o`/`d`/`yy` over expense rows in the detail views (R10, R11, R12 for rows).

**Requirements:** R10, R11, R12

**Dependencies:** U5

**Files:**
- Modify: `apps/web/src/components/ExpenseRow.tsx` (`forwardRef` + `useImperativeHandle`: `startEdit`, `startConfirmDelete`, `confirmDelete`, `cancelConfirm`, `duplicate`)
- Modify: `apps/web/src/views/CategoryDetail.tsx` (cursor over rows; handle collapsed panels)
- Modify: `apps/web/src/views/PanelDetail.tsx` (cursor over rows)
- Modify/Create: `apps/web/src/components/ExpenseRow.test.tsx` (imperative-handle behavior)

**Approach:**
- Add an imperative handle to `ExpenseRow` that drives its existing internal state machines (inline edit, 2-tap confirm via `startConfirm`/`confirmDelete`/`cancelConfirm`, duplicate) — do not duplicate the UX.
- Detail views collect row handles/positions and let the cursor target the active row; `Enter`/`o`→`startEdit`, `yy`→`duplicate`. Delete is a two-step armed flow: first `d`→`startConfirmDelete` (arms the row's existing confirm UI), second `d` on the same row→`confirmDelete`, `Esc`→`cancelConfirm`; moving the cursor or the existing 3s timer disarms, so the second `d` can never hit a different row.
- In `CategoryDetail`, the cursor follows only visible (expanded) rows; collapsed panels are skipped.

**Execution note:** Add the imperative handle test-first to pin the contract before wiring the views.

**Patterns to follow:** existing `confirming`/`editing` state machines and parent handlers in `ExpenseRow.tsx`, `CategoryDetail.tsx`, `PanelDetail.tsx`.

**Test scenarios:**
- Happy path R10: `Enter`/`o` on a cursored row enters inline edit.
- Covers AE4 / R11: `d` then `d` on the same row deletes via the existing confirm; `d` then `Esc` cancels.
- Edge case: `d` (arm) then `j` (move cursor) then `d` does NOT delete the original row — moving the cursor disarms.
- Edge case: `d` then a pause past the existing 3s auto-cancel → next `d` re-arms rather than deleting.
- Happy path R12: `yy` duplicates the cursored expense.
- Edge case: in `CategoryDetail`, the cursor skips rows inside collapsed panels.
- Integration: in a rendered detail view, the imperative handle drives the real row UX (edit affordance appears; delete goes through 2-tap).

**Verification:** Keyboard drives row edit/delete/duplicate through `ExpenseRow`'s existing UX with no duplicated confirm logic; armed-delete state is row-scoped and disarms on cursor move/timeout; collapsed rows are unreachable by the cursor.

---

### U7. Phase 2 — Fast capture *(roadmap — blocked on origin open questions)*

**Goal:** `a` opens QuickAdd globally; `:` opens a command-line capture bar (R16, R17).

**Requirements:** R16, R17

**Dependencies:** U2, U3

**Approach (sketch, not implementation-ready):**
- `a` requires a global "open QuickAdd" mechanism — QuickAdd open-state is per-view today, so this needs lifting to the shell or a small context. Scope that lift carefully (it may touch multiple views). Register the action in the U2 mapper.
- `:` capture parser is blocked on the origin questions: capture-target when no route context (Dashboard) and grammar depth (`#category`, dates, ordering). Resolve these (likely a short `ce-brainstorm`/`ce-plan` pass) before detailing this unit.

**Test scenarios:** Defined when the unit is detailed.

---

### U8. Phase 3 — Command palette *(roadmap — blocked on origin open questions)*

**Goal:** `Cmd-K`/`Ctrl-K` fuzzy palette to jump and run actions (R18, R19); also the natural home for `/` (R13).

**Requirements:** R18, R19, R13

**Dependencies:** U2, U3 (U5 reuse to be confirmed when detailed — a fuzzy palette may not share the DOM list cursor)

**Approach (sketch):** Blocked on defining the palette index (entities + actions). Note: the U2 mapper context has no modifier slot today, so `Cmd-K`/`Ctrl-K` will require extending the mapper signature — reserve a `modifiers` field in Phase 1 if cheap. Detail in its own planning pass.

**Test scenarios:** Defined when the unit is detailed.

---

### U9. Phase 4 — f-hints + month scrub *(roadmap — blocked on origin open questions)*

**Goal:** `f` letter-jump hints; `[`/`]` month scrubbing (R20, R21).

**Requirements:** R20, R21

**Dependencies:** U2, U3, U5

**Approach (sketch):** `[`/`]` drives the existing `MonthPicker` state (lives per-view today — integration point). `f`-hints port from `ypuf`, blocked on defining the target set given React rendering. Detail in its own planning pass.

**Test scenarios:** Defined when the unit is detailed.

---

## System-Wide Impact

- **Interaction graph:** one new `document` keydown listener (in `Layout`); must coexist with existing local Enter/Esc handlers (`Card`, `ExpenseRow`, `PanelDetail` rename, `Login` OTP), the custom popovers (`PanelActions`, `FormSelect`, `ExpenseRow` confirm), and native `<dialog>` Escape — the guards in U3 are what prevent collisions.
- **State lifecycle risks:** stale closures in the long-lived listener (mitigated via refs/stable handler); cursor reanchoring when lists change (tab/month/collapse) and after delete/duplicate mutations; armed-delete state scoped to a single row; pending-chord state leaking between views.
- **API surface parity:** demo-persona parity is deferred (see Scope Boundaries); within the main app, all navigation must respect `useRoutePrefix()`.
- **Unchanged invariants:** no changes to data, DB, migrations, or sync. `ExpenseRow`'s visible behavior and existing props are preserved; the imperative handle is additive.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Stale-closure bug in the persistent keydown listener | Stable handler + refs for latest state; mirror existing listener convention; explicit test. |
| Global handler collides with existing local handlers / custom popovers | Field + `dialog[open]` + custom-popover-marker guards (U3); test each suppression path. |
| jsdom lacks `matchMedia` and `<dialog>.showModal()` | Stub `matchMedia`; assert modal/overlay state via `dialog[open]` and the popover marker rather than top-layer semantics. |
| ExpenseRow imperative refactor regresses existing mouse UX | Handle is additive and drives the same internal state machines; keep existing tests green and add handle tests. |
| Cursor desync after delete/duplicate or in collapsed panels | Anchor identity per the deferred cursor-model decision; reanchor on mutation; follow visible set only. |
| Breakpoint constant drifts from Tailwind `sm` | Centralize `640` in `useIsDesktop`. |

---

## Phased Delivery

### Phase 1 (this plan, implementation-ready)
- U1 → U2 → U3 → (U4, U5) → U6. Ships the engine, guards, route navigation, cheatsheet, and full list navigation + row actions. Independently valuable and de-risks all later phases via the shared intent-mapper. (U5/U6 depend on resolving the cursor-architecture open questions first.)

### Phases 2–4 (roadmap)
- U7 (capture), U8 (palette + `/`), U9 (f-hints + month scrub). Each is gated on its origin open question and gets its own planning pass.

---

## Deferred / Open Questions

### From 2026-06-26 review

- **Cursor vs native focus coexistence** — U5 (cursor / Card focus) (P0, design-lens, confidence 100)

  Cards are already `tabIndex=0`/`role="button"` with a native focus ring; the plan layers `.kbd-cursor` on top without specifying whether the cursor also moves DOM focus (`.focus()` + `aria-current`) or creates a second, independent highlight. The wrong choice produces either a confusing dual-highlight state or a screen-reader dead zone. Decide together with the cursor-identity and listener↔view items below — they are one design.

  <!-- dedup-key: section="u5 cursor card focus" title="cursor vs native focus coexistence" evidence="cards already tabindex0rolebuttonenteractivatable" -->

- **Cursor state model underspecified (identity, initial index, reanchor)** — U5 / U6 (cursor model) (P1, design-lens + adversarial, confidence 100)

  An index-based cursor desyncs after the mutations this feature performs: after `d` deletes the cursored row the list shrinks and the held index points at the wrong row (or runs `scrollIntoView` on undefined); after `yy` the date-grouped list reorders. The plan only commits to reanchoring on tab/month change and never defines the initial index (-1 vs 0) or the post-mutation/route-change rules. Anchor the cursor by stable item id rather than raw index.

  <!-- dedup-key: section="u5 u6 cursor model" title="cursor state model underspecified identity initial index reanchor" evidence="cursor tracks an index over the visible items in the active list" -->

- **Listener↔view cursor seam unspecified (contradicts "no registry")** — U3 / U5 (seam) (P2, feasibility, confidence 75)

  The single keydown listener lives in `Layout` but the cursor index and active-list identity live in the per-view `Outlet` children — and the plan is self-contradictory about the mechanism: Key Technical Decisions say "DOM-driven cursor, not a registration registry," while U5 tells `RouteView` to "register the active card list." Pick one (a small cursor context the active view registers its items + per-item actions into, vs a pure DOM query); a registry is likely required anyway because opening a card and driving a row's imperative handle need view-side callbacks.

  <!-- dedup-key: section="u3 u5 seam" title="listenerview cursor seam unspecified contradicts no registry" evidence="own the single document keydown listener apply all guards manage pendingsequence state and dispatch the noncursor actions" -->

---

## Sources & References

- **Origin document:** [docs/brainstorms/vim-keyboard-shortcuts-requirements.md](docs/brainstorms/vim-keyboard-shortcuts-requirements.md)
- Reference implementation: `ypuf` — `extension/lib/boardkeys.js` (pure intent-mapper), `extension/newtab/newtab.js` (DOM glue, cursor, cheatsheet)
- Key reuse points: `apps/web/src/components/Layout.tsx`, `apps/web/src/components/ExpenseRow.tsx`, `apps/web/src/views/RouteView.tsx`, `apps/web/src/components/Modal.tsx`, `apps/web/src/hooks/useInstallPrompt.ts`
