# Misc Fix/Feat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add version display in Settings, "Open Mail App" button on login code screen, and inline description editing on expense rows.

**Architecture:** Three independent UI changes in the web app. Feature 1 adds a Vite `define` for the version and renders it in Settings. Feature 2 adds a `mailto:` link to the login code entry screen. Feature 3 extends the existing click-to-edit pattern in `ExpenseRow` to support description editing, wiring through `PanelDetail` and `CategoryDetail`.

**Tech Stack:** React 19, Vite, Tailwind CSS v4, Vitest + Testing Library

---

### Task 1: Add app version to Vite build config

**Files:**

- Modify: `apps/web/vite.config.ts:7` (add `define` with version from root package.json)

**Step 1: Add define to vite config**

In `apps/web/vite.config.ts`, add `fs` import and a `define` block that reads the root `package.json` version:

```typescript
import fs from 'fs'

// Inside defineConfig, after the resolve block (line 58):
define: {
  __APP_VERSION__: JSON.stringify(
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8')).version,
  ),
},
```

**Step 2: Add TypeScript declaration**

Create `apps/web/src/globals.d.ts`:

```typescript
declare const __APP_VERSION__: string
```

**Step 3: Verify build compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/vite.config.ts apps/web/src/globals.d.ts
git commit -m "feat: expose app version via Vite define"
```

---

### Task 2: Display version in Settings

**Files:**

- Modify: `apps/web/src/views/Settings.tsx:486` (add version text before closing `</div>`)

**Step 1: Add version text at the bottom of Settings**

In `Settings.tsx`, just before the final `</div>` (line 486), after the `</Modal>` closing tag (line 485), add:

```tsx
<p className="mt-8 text-center text-xs text-text-muted">v{__APP_VERSION__}</p>
```

**Step 2: Verify it renders**

Run: `cd apps/web && npx vite build`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add apps/web/src/views/Settings.tsx
git commit -m "feat: display app version at bottom of Settings page"
```

---

### Task 3: Add "Open Mail App" button to login code screen

**Files:**

- Modify: `apps/web/src/views/Login.tsx:157-168` (add mailto link between error/verifying text and "Try a different email")

**Step 1: Add the Open Mail App link**

In `Login.tsx`, between the verifying/error messages (lines 158-159) and the "Try a different email" button (lines 161-168), insert:

```tsx
<a
  href="mailto:"
  className="mt-4 inline-block rounded-md border border-border-dim px-4 py-2 text-sm text-text-secondary transition-colors hover:border-neon-cyan hover:text-neon-cyan"
>
  Open Mail App
</a>
```

This should be placed after line 159 (`{error && ...}`) and before line 161 (`<button ... resetToEmail>`).

**Step 2: Verify build compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/src/views/Login.tsx
git commit -m "feat: add Open Mail App button to login code entry screen"
```

---

### Task 4: Add inline description editing to ExpenseRow

**Files:**

- Modify: `apps/web/src/components/ExpenseRow.tsx:6-11` (add `onUpdateDescription` to props)
- Modify: `apps/web/src/components/ExpenseRow.tsx:23-28` (add description editing state)
- Modify: `apps/web/src/components/ExpenseRow.tsx:79-88` (replace description span with click-to-edit)

**Step 1: Add `onUpdateDescription` prop**

In `ExpenseRow.tsx`, update the `ExpenseRowProps` interface (lines 6-11) to add:

```typescript
interface ExpenseRowProps {
  expense: ExpenseRowType
  category?: CategoryRow
  onUpdateAmount: (id: string, amount: number) => Promise<void>
  onUpdateDescription?: (id: string, description: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}
```

Update the destructuring on line 23:

```typescript
export function ExpenseRow({ expense, category, onUpdateAmount, onUpdateDescription, onDelete }: ExpenseRowProps) {
```

**Step 2: Add description editing state and handlers**

After the existing `editingAmount` state (line 24), add:

```typescript
const [editingDescription, setEditingDescription] = useState(false)
const [editDescValue, setEditDescValue] = useState('')
const descInputRef = useRef<HTMLInputElement>(null)
```

After the `saveAmount` callback (line 42), add:

```typescript
const startEditingDescription = useCallback(() => {
  setEditDescValue(expense.description ?? '')
  setEditingDescription(true)
  requestAnimationFrame(() => descInputRef.current?.select())
}, [expense.description])

const saveDescription = useCallback(async () => {
  setEditingDescription(false)
  const trimmed = editDescValue.trim()
  if (trimmed === (expense.description ?? '')) return
  await onUpdateDescription?.(expense.id, trimmed)
}, [editDescValue, expense.id, expense.description, onUpdateDescription])
```

**Step 3: Replace description rendering**

Replace the description block (lines 81-83):

```tsx
{
  expense.description && <span className="text-sm text-text-secondary">{expense.description}</span>
}
```

With the click-to-edit pattern:

```tsx
{
  editingDescription ? (
    <input
      ref={descInputRef}
      type="text"
      value={editDescValue}
      onChange={(e) => setEditDescValue(e.target.value)}
      onBlur={saveDescription}
      onKeyDown={(e) => {
        if (e.key === 'Enter') saveDescription()
        if (e.key === 'Escape') setEditingDescription(false)
      }}
      className="w-32 border-b-2 border-neon-cyan bg-transparent text-sm text-text-primary outline-none"
      placeholder="add note"
    />
  ) : (
    <button
      onClick={onUpdateDescription ? startEditingDescription : undefined}
      className={`text-sm ${expense.description ? 'text-text-secondary' : 'text-text-muted/50 italic'} ${onUpdateDescription ? 'cursor-text transition-opacity hover:opacity-70' : ''}`}
    >
      {expense.description || 'add note'}
    </button>
  )
}
```

**Step 4: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors (the prop is optional, so existing callers don't break)

**Step 5: Commit**

```bash
git add apps/web/src/components/ExpenseRow.tsx
git commit -m "feat: add inline description editing to ExpenseRow"
```

---

### Task 5: Wire description editing in PanelDetail

**Files:**

- Modify: `apps/web/src/views/PanelDetail.tsx:107-113` (add handleUpdateDescription after handleUpdateAmount)
- Modify: `apps/web/src/views/PanelDetail.tsx:313-319` (pass onUpdateDescription prop to ExpenseRow)

**Step 1: Add handleUpdateDescription callback**

After `handleUpdateAmount` (line 113), add:

```typescript
const handleUpdateDescription = useCallback(
  async (id: string, description: string) => {
    await update(id, { description: description || undefined })
  },
  [update],
)
```

**Step 2: Pass prop to ExpenseRow**

In the ExpenseRow render (lines 313-319), add the `onUpdateDescription` prop:

```tsx
<ExpenseRow
  key={expense.id}
  expense={expense}
  category={categoryMap.get(expense.category_id)}
  onUpdateAmount={handleUpdateAmount}
  onUpdateDescription={handleUpdateDescription}
  onDelete={handleRemove}
/>
```

**Step 3: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/views/PanelDetail.tsx
git commit -m "feat: wire description editing in PanelDetail"
```

---

### Task 6: Wire description editing in CategoryDetail

**Files:**

- Modify: `apps/web/src/views/CategoryDetail.tsx:146-153` (add handleUpdateDescription after handleUpdateAmount)
- Modify: `apps/web/src/views/CategoryDetail.tsx:268-275` (pass onUpdateDescription prop to ExpenseRow)

**Step 1: Add handleUpdateDescription callback**

After `handleUpdateAmount` (line 153), add:

```typescript
const handleUpdateDescription = useCallback(
  async (id: string, description: string) => {
    await update(id, { description: description || undefined })
  },
  [update],
)
```

**Step 2: Pass prop to ExpenseRow**

In the ExpenseRow render (lines 268-275), add the `onUpdateDescription` prop:

```tsx
<ExpenseRow
  key={expense.id}
  expense={expense}
  onUpdateAmount={handleUpdateAmount}
  onUpdateDescription={handleUpdateDescription}
  onDelete={handleRemove}
/>
```

**Step 3: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/views/CategoryDetail.tsx
git commit -m "feat: wire description editing in CategoryDetail"
```

---

### Task 7: Run all tests and verify

**Step 1: Run full test suite**

Run: `cd apps/web && npx vitest run`
Expected: All tests pass

**Step 2: Run linter/formatter**

Run: `cd /Users/rubberduck/GitHub/momentmaker/pancakemaker && npm run format`
Expected: No errors

**Step 3: Final commit if formatter changed anything**

```bash
git add -A
git commit -m "style: format code"
```
