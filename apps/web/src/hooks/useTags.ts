import { useState, useCallback } from 'react'
import { useDatabase } from '../db/DatabaseContext.js'
import { getTagsByUser, createTag, deleteTag, logSyncEntry, type TagRow } from '../db/queries.js'

export function useTags(userId: string) {
  const db = useDatabase()
  const [tags, setTags] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getTagsByUser(db, userId)
      setTags(rows)
    } finally {
      setLoading(false)
    }
  }, [db, userId])

  const add = useCallback(
    async (name: string) => {
      const tag = await createTag(db, userId, name)
      setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)))
      await logSyncEntry(
        db,
        userId,
        'tags',
        tag.id,
        'create',
        tag as unknown as Record<string, unknown>,
      )
      return tag
    },
    [db, userId],
  )

  const remove = useCallback(
    async (id: string) => {
      await deleteTag(db, id)
      setTags((prev) => prev.filter((t) => t.id !== id))
      await logSyncEntry(db, userId, 'tags', id, 'delete', { id })
    },
    [db, userId],
  )

  return { tags, loading, load, add, remove }
}
