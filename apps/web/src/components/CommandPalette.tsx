import { useEffect, useMemo, useRef, useState } from 'react'
import { rankWithin } from '../lib/command-palette/fuzzy'
import {
  COMMAND_GROUP_ORDER,
  type CommandGroup,
  type CommandItem,
} from '../lib/command-palette/types'

const LISTBOX_ID = 'command-palette-listbox'
const DEFAULT_RECENT_COUNT = 5

interface CommandPaletteProps {
  open: boolean
  items: CommandItem[]
  onClose: () => void
}

// Empty-query default set: routes + a few recent expenses + actions — useful
// with zero typing, without dumping every category and panel.
function defaultSet(items: CommandItem[]): CommandItem[] {
  const routes = items.filter((i) => i.group === 'Routes')
  const recent = items.filter((i) => i.group === 'Recent expenses').slice(0, DEFAULT_RECENT_COUNT)
  const actions = items.filter((i) => i.group === 'Actions')
  return [...routes, ...recent, ...actions]
}

export function CommandPalette({ open, items, onClose }: CommandPaletteProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      setQuery('')
      setHighlight(0)
      if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal()
      inputRef.current?.focus()
    } else if (dialog.open && typeof dialog.close === 'function') {
      dialog.close()
    }
  }, [open])

  const visible = useMemo<CommandItem[]>(
    () =>
      query.trim() === '' ? defaultSet(items) : rankWithin(query, items, (item) => item.matchText),
    [query, items],
  )

  // Reset the highlight to the first row whenever the query changes the result set.
  useEffect(() => {
    setHighlight(0)
  }, [query])

  const activeIndex = visible.length === 0 ? -1 : Math.min(highlight, visible.length - 1)
  const activeId = activeIndex >= 0 ? visible[activeIndex]?.id : undefined

  // Keep the highlighted row in view as the cursor moves.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const row = listRef.current?.querySelector(`[data-cmd-index="${activeIndex}"]`)
    if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, open])

  const grouped = useMemo(() => {
    const byGroup = new Map<CommandGroup, { item: CommandItem; index: number }[]>()
    visible.forEach((item, index) => {
      const entries = byGroup.get(item.group) ?? []
      entries.push({ item, index })
      byGroup.set(item.group, entries)
    })
    return COMMAND_GROUP_ORDER.filter((group) => byGroup.has(group)).map((group) => ({
      group,
      entries: byGroup.get(group)!,
    }))
  }, [visible])

  function moveHighlight(delta: number) {
    if (visible.length === 0) return
    setHighlight((current) => {
      const clamped = Math.min(current, visible.length - 1)
      return (clamped + delta + visible.length) % visible.length
    })
  }

  function runAt(index: number) {
    const item = visible[index]
    if (!item) return
    item.run()
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveHighlight(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveHighlight(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runAt(activeIndex)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      data-kbd-popover-open
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-auto w-full max-w-lg rounded-lg border border-border-dim bg-bg-secondary p-0 text-text-primary backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div onKeyDown={handleKeyDown} className="flex flex-col">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Jump to anything…"
          aria-label="Command palette"
          role="combobox"
          aria-expanded={true}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={activeId}
          className="border-b border-border-dim bg-transparent px-4 py-3 font-mono text-base text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        <div
          ref={listRef}
          id={LISTBOX_ID}
          role="listbox"
          className="max-h-[60vh] overflow-y-auto py-1"
        >
          {visible.length === 0 ? (
            <div className="px-4 py-3 text-sm text-text-muted">No results for “{query}”</div>
          ) : (
            grouped.map(({ group, entries }) => (
              <div key={group} role="presentation">
                <div
                  role="presentation"
                  className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted"
                >
                  {group}
                </div>
                {entries.map(({ item, index }) => (
                  <button
                    key={item.id}
                    id={item.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    data-cmd-index={index}
                    onMouseMove={() => setHighlight(index)}
                    onClick={() => runAt(index)}
                    className={`flex w-full items-baseline justify-between gap-3 px-4 py-1.5 text-left text-sm transition-colors ${
                      index === activeIndex
                        ? 'bg-neon-cyan/10 text-neon-cyan'
                        : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.sublabel && (
                      <span className="shrink-0 font-mono text-xs text-text-muted">
                        {item.sublabel}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </dialog>
  )
}
