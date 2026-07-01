// A labelled f-hint target: the badge label, the DOM element to activate, its
// cursor id when it is a cursor-registered item (else null → activate by click),
// and the on-screen position to anchor the badge.
export interface HintTarget {
  label: string
  id: string | null
  element: HTMLElement
  rect: { top: number; left: number }
}

// Purely visual badge layer. The provider owns key handling; this just paints
// the labels. `data-kbd-popover-open` stands the global shortcut layer down;
// badges are aria-hidden (transient visual cues), the root is a labelled dialog.
export function FHintOverlay({ targets }: { targets: HintTarget[] }) {
  return (
    <div
      data-kbd-popover-open
      role="dialog"
      aria-label="Hint mode — press a highlighted key"
      className="pointer-events-none fixed inset-0 z-[60]"
    >
      {targets.map((target) => (
        <span
          key={target.label}
          aria-hidden="true"
          className="absolute rounded border border-neon-cyan/60 bg-bg-primary/90 px-1 font-mono text-xs font-semibold text-neon-cyan shadow"
          style={{ top: target.rect.top + 2, left: target.rect.left + 2 }}
        >
          {target.label}
        </span>
      ))}
    </div>
  )
}
