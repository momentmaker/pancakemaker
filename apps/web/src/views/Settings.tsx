import { useEffect, useState, useCallback } from 'react'
import { SUPPORTED_CURRENCIES } from '@pancakemaker/shared'
import { useAppState } from '../hooks/useAppState'
import { useCategories } from '../hooks/useCategories'
import { useDatabase } from '../db/DatabaseContext'
import { getExportRows } from '../db/queries'
import { formatCSV, formatJSON, downloadFile } from '../lib/export'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { FormInput, FormSelect } from '../components/FormInput'
import { Modal } from '../components/Modal'
import { SyncIndicator } from '../components/SyncIndicator'
import { useSync } from '../sync/SyncContext'

const PALETTE = [
  '#00ffcc',
  '#38bdf8',
  '#c084fc',
  '#e879f9',
  '#ff6b9d',
  '#f97316',
  '#fbbf24',
  '#a3e635',
  '#60a5fa',
  '#818cf8',
  '#f472b6',
  '#fb923c',
  '#34d399',
  '#2dd4bf',
  '#a78bfa',
  '#fca5a5',
]

export function Settings() {
  const { userId, personalRouteId, businessRouteId, baseCurrency } = useAppState()
  const { status: syncStatus, triggerSync } = useSync()
  const personalCategories = useCategories(personalRouteId)
  const businessCategories = useCategories(businessRouteId)

  const db = useDatabase()
  const [exporting, setExporting] = useState(false)

  const [editingCategory, setEditingCategory] = useState<{
    id: string
    name: string
    color: string
    routeId: string
    isNew: boolean
  } | null>(null)

  const [deleteConfirm, setDeleteConfirm] = useState<{
    expenseCount: number
    reassignTargetId: string
  } | null>(null)

  useEffect(() => {
    personalCategories.load()
    businessCategories.load()
  }, [personalCategories.load, businessCategories.load])

  const handleOpenAddCategory = useCallback((routeId: string, existingColors: string[]) => {
    const used = new Set(existingColors.map((c) => c.toLowerCase()))
    const available = PALETTE.filter((c) => !used.has(c.toLowerCase()))
    const pool = available.length > 0 ? available : PALETTE
    const color = pool[Math.floor(Math.random() * pool.length)]
    setEditingCategory({
      id: '',
      name: '',
      color,
      routeId,
      isNew: true,
    })
  }, [])

  const handleSaveCategory = useCallback(async () => {
    if (!editingCategory || !editingCategory.name.trim()) return
    const hook =
      editingCategory.routeId === personalRouteId ? personalCategories : businessCategories
    if (editingCategory.isNew) {
      const count = hook.categories.length
      await hook.add(editingCategory.name.trim(), editingCategory.color, count)
    } else {
      await hook.update(editingCategory.id, {
        name: editingCategory.name.trim(),
        color: editingCategory.color,
      })
    }
    setEditingCategory(null)
  }, [editingCategory, personalRouteId, personalCategories, businessCategories])

  const handleDeleteCategory = useCallback(async () => {
    if (!editingCategory || editingCategory.isNew) return
    const rows = await db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM expenses WHERE category_id = ? AND deleted_at IS NULL',
      [editingCategory.id],
    )
    const count = rows[0]?.count ?? 0
    if (count === 0) {
      const hook =
        editingCategory.routeId === personalRouteId ? personalCategories : businessCategories
      await hook.remove(editingCategory.id)
      setEditingCategory(null)
      setDeleteConfirm(null)
      return
    }
    const hook =
      editingCategory.routeId === personalRouteId ? personalCategories : businessCategories
    const others = hook.categories.filter((c) => c.id !== editingCategory.id)
    setDeleteConfirm({
      expenseCount: count,
      reassignTargetId: others[0]?.id ?? '',
    })
  }, [editingCategory, db, personalRouteId, personalCategories, businessCategories])

  const handleConfirmDelete = useCallback(
    async (reassign: boolean) => {
      if (!editingCategory) return
      const hook =
        editingCategory.routeId === personalRouteId ? personalCategories : businessCategories
      if (reassign && deleteConfirm?.reassignTargetId) {
        await hook.remove(editingCategory.id, deleteConfirm.reassignTargetId)
      } else {
        await hook.remove(editingCategory.id)
      }
      setEditingCategory(null)
      setDeleteConfirm(null)
    },
    [editingCategory, deleteConfirm, personalRouteId, personalCategories, businessCategories],
  )

  const handleExport = useCallback(
    async (format: 'csv' | 'json') => {
      setExporting(true)
      try {
        const rows = await getExportRows(db, userId)
        const date = new Date().toISOString().slice(0, 10)
        if (format === 'csv') {
          downloadFile(formatCSV(rows), `pancakemaker-${date}.csv`, 'text/csv')
        } else {
          downloadFile(formatJSON(rows), `pancakemaker-${date}.json`, 'application/json')
        }
      } finally {
        setExporting(false)
      }
    },
    [db, userId],
  )

  const currencyOptions = SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))

  return (
    <div>
      <h1 className="font-mono text-2xl font-bold text-neon-cyan">Settings</h1>

      {/* Base Currency */}
      <Card className="mt-6">
        <h2 className="font-mono text-sm font-semibold text-text-secondary">Base Currency</h2>
        <div className="mt-3 max-w-xs">
          <FormSelect
            label=""
            value={baseCurrency}
            onChange={() => {
              // currency change will be wired in Stage 4
            }}
            options={currencyOptions}
          />
          <p className="mt-1 text-xs text-text-muted">
            Currency conversion will be available after sync is enabled.
          </p>
        </div>
      </Card>

      {/* Sync Status */}
      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-text-secondary">Sync Status</h2>
          <SyncIndicator status={syncStatus} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-text-muted">
            {syncStatus === 'offline'
              ? 'No network connection.'
              : syncStatus === 'pending'
                ? 'Syncing changes...'
                : 'All changes synced.'}
          </p>
          <Button variant="ghost" onClick={triggerSync} disabled={syncStatus === 'offline'}>
            Sync now
          </Button>
        </div>
      </Card>

      {/* Export Data */}
      <Card className="mt-4">
        <h2 className="font-mono text-sm font-semibold text-text-secondary">Export Data</h2>
        <p className="mt-1 text-xs text-text-muted">Download all your expenses.</p>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={() => handleExport('csv')} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Download CSV'}
          </Button>
          <Button variant="secondary" onClick={() => handleExport('json')} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Download JSON'}
          </Button>
        </div>
      </Card>

      {/* Personal Categories */}
      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-text-secondary">
            Personal Categories
          </h2>
          <Button
            variant="ghost"
            onClick={() =>
              handleOpenAddCategory(
                personalRouteId,
                personalCategories.categories.map((c) => c.color),
              )
            }
          >
            + Add
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {personalCategories.categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() =>
                setEditingCategory({
                  id: cat.id,
                  name: cat.name,
                  color: cat.color,
                  routeId: personalRouteId,
                  isNew: false,
                })
              }
              className="transition-opacity hover:opacity-80"
            >
              <Badge label={cat.name} color={cat.color} />
            </button>
          ))}
        </div>
      </Card>

      {/* Business Categories */}
      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-text-secondary">
            Business Categories
          </h2>
          <Button
            variant="ghost"
            onClick={() =>
              handleOpenAddCategory(
                businessRouteId,
                businessCategories.categories.map((c) => c.color),
              )
            }
          >
            + Add
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {businessCategories.categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() =>
                setEditingCategory({
                  id: cat.id,
                  name: cat.name,
                  color: cat.color,
                  routeId: businessRouteId,
                  isNew: false,
                })
              }
              className="transition-opacity hover:opacity-80"
            >
              <Badge label={cat.name} color={cat.color} />
            </button>
          ))}
        </div>
      </Card>

      {/* Edit Category Modal */}
      <Modal
        open={editingCategory !== null}
        onClose={() => {
          setEditingCategory(null)
          setDeleteConfirm(null)
        }}
        title={editingCategory?.isNew ? 'Add Category' : 'Edit Category'}
      >
        {editingCategory && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSaveCategory()
            }}
            className="flex flex-col gap-4"
          >
            <FormInput
              label="Name"
              value={editingCategory.name}
              onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
            />
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-text-secondary">Color</label>
              <div className="grid grid-cols-8 gap-2">
                {PALETTE.map((c) => {
                  const selected = editingCategory.color.toLowerCase() === c.toLowerCase()
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditingCategory({ ...editingCategory, color: c })}
                      className="group relative flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110"
                      style={{
                        background: c,
                        boxShadow: selected ? `0 0 12px ${c}80, 0 0 24px ${c}40` : `0 0 6px ${c}30`,
                        outline: selected ? `2px solid ${c}` : 'none',
                        outlineOffset: '2px',
                      }}
                      aria-label={c}
                    >
                      {selected && (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path
                            d="M3 8l3.5 3.5L13 5"
                            stroke="#0a0a0f"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="mt-1 flex items-center gap-3">
                <label className="relative cursor-pointer">
                  <input
                    type="color"
                    value={editingCategory.color}
                    onChange={(e) =>
                      setEditingCategory({ ...editingCategory, color: e.target.value })
                    }
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                  <span className="inline-flex items-center gap-1.5 rounded border border-border-dim px-2 py-1 text-xs text-text-muted transition-colors hover:border-border-glow hover:text-text-secondary">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: editingCategory.color }}
                    />
                    Custom color
                  </span>
                </label>
                <span className="font-mono text-xs text-text-muted">{editingCategory.color}</span>
              </div>
            </div>
            {editingCategory.name.trim() && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">Preview</label>
                <div>
                  <Badge label={editingCategory.name.trim()} color={editingCategory.color} />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setEditingCategory(null)
                  setDeleteConfirm(null)
                }}
              >
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
            {!editingCategory.isNew && !deleteConfirm && (
              <div className="mt-2 border-t border-border-dim pt-3">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={handleDeleteCategory}
                  className="text-red-400 hover:text-red-300"
                >
                  Delete category
                </Button>
              </div>
            )}
            {deleteConfirm &&
              (() => {
                const hook =
                  editingCategory.routeId === personalRouteId
                    ? personalCategories
                    : businessCategories
                const others = hook.categories.filter((c) => c.id !== editingCategory.id)
                return (
                  <div className="mt-2 border-t border-border-dim pt-3">
                    <p className="text-sm text-text-secondary">
                      This category has {deleteConfirm.expenseCount} expense(s).
                    </p>
                    {others.length > 0 && (
                      <div className="mt-3 flex flex-col gap-2">
                        <FormSelect
                          label="Move expenses to"
                          value={deleteConfirm.reassignTargetId}
                          onChange={(value) =>
                            setDeleteConfirm({ ...deleteConfirm, reassignTargetId: value })
                          }
                          options={others.map((c) => ({ value: c.id, label: c.name }))}
                        />
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={() => handleConfirmDelete(true)}
                        >
                          Move &amp; delete
                        </Button>
                      </div>
                    )}
                    <div className="mt-2">
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() => handleConfirmDelete(false)}
                        className="text-red-400 hover:text-red-300"
                      >
                        Delete all expenses
                      </Button>
                    </div>
                    <div className="mt-1">
                      <Button variant="ghost" type="button" onClick={() => setDeleteConfirm(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )
              })()}
          </form>
        )}
      </Modal>
    </div>
  )
}
