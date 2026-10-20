import { vi } from 'vitest'
import type { SyncPullEntry, SyncPushEntry } from './api-client.js'

export interface FakeSyncServer {
  entries: SyncPullEntry[]
  pullCursors: (string | null)[]
}

interface FakeSyncServerOptions {
  pageSize?: number
  pushTimestamp?: string
  failPullNumber?: number
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function splitCursor(cursor: string | null): [string, string] {
  if (cursor === null) return ['', '']
  const separator = cursor.lastIndexOf('|')
  if (separator === -1) return [cursor, '']
  return [cursor.slice(0, separator), cursor.slice(separator + 1)]
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

export function installFakeSyncServer(options: FakeSyncServerOptions = {}): FakeSyncServer {
  const pageSize = options.pageSize ?? 1000
  const server: FakeSyncServer = { entries: [], pullCursors: [] }

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))

    if (url.pathname === '/sync/push') {
      const { entries } = JSON.parse(String(init?.body)) as { entries: SyncPushEntry[] }
      const serverTimestamp = options.pushTimestamp ?? new Date().toISOString()
      for (const entry of entries) {
        server.entries.push({ ...entry, server_timestamp: serverTimestamp })
      }
      return jsonResponse({ ok: true, synced: entries.length, server_timestamp: serverTimestamp })
    }

    if (url.pathname === '/sync/pull') {
      const cursor = url.searchParams.get('cursor')
      server.pullCursors.push(cursor)
      if (server.pullCursors.length === options.failPullNumber) {
        return jsonResponse({ error: 'Server error' }, 500)
      }
      const [timestamp, id] = splitCursor(cursor)
      const page = [...server.entries]
        .sort(
          (a, b) =>
            compareStrings(a.server_timestamp, b.server_timestamp) || compareStrings(a.id, b.id),
        )
        .filter(
          (e) => e.server_timestamp > timestamp || (e.server_timestamp === timestamp && e.id > id),
        )
        .slice(0, pageSize)
      return jsonResponse({
        entries: page,
        server_timestamp: new Date().toISOString(),
        has_more: page.length === pageSize,
      })
    }

    return jsonResponse({ error: 'Not found' }, 404)
  })

  return server
}
