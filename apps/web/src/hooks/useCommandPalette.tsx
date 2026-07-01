import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from './useAppState'
import { useDatabase } from '../db/DatabaseContext'
import { useSync } from '../sync/SyncContext'
import { useCapture } from './useCapture'
import { useKeyboardCursor } from './useKeyboardCursor'
import { useCommandIndex, type CommandActions } from './useCommandIndex'
import { exportData } from '../lib/export'
import { CommandPalette } from '../components/CommandPalette'
import { KeyboardCheatsheet } from '../components/KeyboardCheatsheet'

export interface CommandPaletteContextValue {
  openPalette: () => void
  openCheatsheet: () => void
}

// Exported so tests can provide a stub value (e.g. for the Cmd-K hook) without
// the full provider.
export const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { userId } = useAppState()
  const db = useDatabase()
  const { forceSync } = useSync()
  const capture = useCapture()
  const cursor = useKeyboardCursor()

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false)

  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const openCheatsheet = useCallback(() => setCheatsheetOpen(true), [])

  // Depend on the stable openQuickAdd / requestFocus callbacks, not the whole
  // capture / cursor context values — those change identity on unrelated state
  // (e.g. every cursor move), which would otherwise rebuild the entire index.
  const openQuickAdd = capture?.openQuickAdd
  const requestFocus = cursor?.requestFocus

  const actions = useMemo<CommandActions>(
    () => ({
      navigate: (to, options) => navigate(to, options),
      openQuickAdd: () => openQuickAdd?.(),
      openCheatsheet,
      syncNow: () => {
        forceSync().catch((err) => console.error('Sync failed', err))
      },
      focusExpense: (id) => requestFocus?.(id),
      exportCsv: () => {
        exportData(db, userId, 'csv').catch((err) => console.error('Export failed', err))
      },
      exportJson: () => {
        exportData(db, userId, 'json').catch((err) => console.error('Export failed', err))
      },
    }),
    [navigate, openQuickAdd, openCheatsheet, forceSync, requestFocus, db, userId],
  )

  const items = useCommandIndex(actions)

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ openPalette, openCheatsheet }),
    [openPalette, openCheatsheet],
  )

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette open={paletteOpen} items={items} onClose={() => setPaletteOpen(false)} />
      <KeyboardCheatsheet open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />
    </CommandPaletteContext.Provider>
  )
}

export function useCommandPalette(): CommandPaletteContextValue | null {
  return useContext(CommandPaletteContext)
}
