# Misc Fix/Feat Design

## 1. Version Display in Settings

Display `v1.2.0` as plain muted text centered at the bottom of the Settings page.

- Expose root `package.json` version via Vite `define` at build time as `__APP_VERSION__`
- Add global type declaration for TypeScript
- Render `<p className="text-xs text-text-secondary text-center">v{__APP_VERSION__}</p>` at the end of Settings

## 2. Open Mail App Button (Login Code Screen)

Add an "Open Mail App" link below the 6-digit code input boxes, above "Try a different email".

- Use `<a href="mailto:">` styled as a secondary button
- Empty `mailto:` URI opens the default mail client on iOS/Android/desktop
- No native bridge needed since this is a PWA

## 3. Inline Expense Description Editing

Click description text to edit inline. Enter/blur saves, Escape cancels. Empty descriptions show faint "add note" placeholder.

- Follow existing click-to-edit pattern from amount editing in `ExpenseRow.tsx`
- Add `editingDescription`/`editDescValue` state
- Add `onUpdateDescription` callback prop
- Wire up in `PanelDetail.tsx` and `CategoryDetail.tsx`
- `updateExpense` query and `useExpenses.update` hook already support `description` updates

## Files to Modify

| Feature            | Files                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Version display    | `apps/web/vite.config.ts`, `apps/web/src/views/Settings.tsx`, new `apps/web/src/vite-env.d.ts` or equivalent            |
| Open mail app      | `apps/web/src/views/Login.tsx`                                                                                          |
| Inline description | `apps/web/src/components/ExpenseRow.tsx`, `apps/web/src/views/PanelDetail.tsx`, `apps/web/src/views/CategoryDetail.tsx` |
