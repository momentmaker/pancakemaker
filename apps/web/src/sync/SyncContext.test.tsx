import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { ReactNode } from 'react'
import { DatabaseProvider } from '../db/DatabaseContext.js'
import { createTestDatabase } from '../db/test-db.js'
import { SyncProvider, useSync } from './SyncContext.js'

const db = createTestDatabase()

function wrapper({ children }: { children: ReactNode }) {
  return (
    <DatabaseProvider database={db}>
      <SyncProvider>{children}</SyncProvider>
    </DatabaseProvider>
  )
}

describe('SyncProvider', () => {
  it('lets a local write refresh views that watch the changed tables', () => {
    // #given
    const { result } = renderHook(() => useSync(), { wrapper })
    const before = {
      data: result.current.dataVersion,
      expenses: result.current.tableVersions['expenses'] ?? 0,
    }

    // #when
    act(() => result.current.notifyLocalChange(['expenses']))

    // #then
    expect({
      data: result.current.dataVersion - before.data,
      expenses: (result.current.tableVersions['expenses'] ?? 0) - before.expenses,
    }).toEqual({ data: 1, expenses: 1 })
  })
})
