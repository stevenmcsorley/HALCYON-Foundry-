import React from 'react'
import { useSavedStore, savedApi, type SavedQuery } from '@/store/savedStore'
import { gql } from '@/services/api'
import { AlertDialog } from '@/components/AlertDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { showToast } from '@/components/Toast'
import { inferShape, getShapeLabel, type ShapeInfo } from '@/lib/queryShapes'

interface RunState {
  data: Record<string, unknown> | null
  shape: ShapeInfo | null
  error?: string
  executedAt?: string
}

const EMPTY_QUERY = `# GraphQL example
query {
  health
}`

export default function SavedQueriesPanel(): JSX.Element {
  const { queries, loadQueries } = useSavedStore()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [name, setName] = React.useState('')
  const [text, setText] = React.useState(EMPTY_QUERY)
  const [shapeHint, setShapeHint] = React.useState<string | undefined>(undefined)
  const [runState, setRunState] = React.useState<RunState | null>(null)
  const [busy, setBusy] = React.useState(false)

  const [alertDialog, setAlertDialog] = React.useState<{
    isOpen: boolean
    title: string
    message: string
    variant?: 'error' | 'info' | 'success'
  }>({ isOpen: false, title: '', message: '', variant: 'info' })

  const [confirmDialog, setConfirmDialog] = React.useState<{
    isOpen: boolean
    queryId: string | null
    message: string
  }>({ isOpen: false, queryId: null, message: '' })

  React.useEffect(() => {
    loadQueries()
  }, [loadQueries])

  React.useEffect(() => {
    if (!selectedId) {
      setName('')
      setText(EMPTY_QUERY)
      setShapeHint(undefined)
      setRunState(null)
      return
    }

    const found = queries.find((q) => q.id === selectedId)
    if (found) {
      setName(found.name)
      setText(found.gql)
      setShapeHint(found.shapeHint)
      setRunState(null)
    }
  }, [selectedId, queries])

  const filteredQueries = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return queries
    return queries.filter((q) =>
      q.name.toLowerCase().includes(term) || q.gql.toLowerCase().includes(term)
    )
  }, [queries, search])

  const showError = (title: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    setAlertDialog({ isOpen: true, title, message, variant: 'error' })
  }

  const handleRun = async () => {
    setBusy(true)
    try {
      const data = await gql<Record<string, unknown>>(text)
      const inferred = inferShape(data)
      setRunState({ data, shape: inferred, executedAt: new Date().toISOString() })
      if (inferred.shape !== 'unknown') {
        setShapeHint(inferred.shape)
      }
      showToast('Query executed')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run query'
      setRunState({ data: null, shape: null, error: message, executedAt: new Date().toISOString() })
      showError('Run Failed', error)
    } finally {
      setBusy(false)
    }
  }

  const handleReset = () => {
    setSelectedId(null)
    setName('')
    setText(EMPTY_QUERY)
    setShapeHint(undefined)
    setRunState(null)
  }

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setAlertDialog({
        isOpen: true,
        title: 'Validation Error',
        message: 'Please provide a query name before saving.',
        variant: 'error',
      })
      return
    }

    setBusy(true)
    try {
      const inferredShape = runState?.shape?.shape ?? shapeHint ?? 'unknown'
      if (selectedId) {
        await savedApi.updateQuery(selectedId, {
          name: trimmedName,
          gql: text,
          shapeHint: inferredShape,
        })
        showToast('Query updated')
      } else {
        const created = await savedApi.createQuery({
          name: trimmedName,
          gql: text,
          shapeHint: inferredShape,
        })
        setSelectedId(created.id)
        showToast('Query saved')
      }
      await loadQueries()
    } catch (error) {
      showError('Save Failed', error)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    const id = confirmDialog.queryId
    if (!id) return
    setBusy(true)
    try {
      await savedApi.deleteQuery(id)
      if (selectedId === id) {
        handleReset()
      }
      await loadQueries()
      showToast('Query deleted')
    } catch (error) {
      showError('Delete Failed', error)
    } finally {
      setBusy(false)
      setConfirmDialog({ isOpen: false, queryId: null, message: '' })
    }
  }

  const handleDuplicate = async (query: SavedQuery) => {
    setBusy(true)
    try {
      const duplicated = await savedApi.createQuery({
        name: `${query.name} (copy)`,
        gql: query.gql,
        shapeHint: query.shapeHint,
      })
      await loadQueries()
      setSelectedId(duplicated.id)
      showToast('Query duplicated')
    } catch (error) {
      showError('Duplicate Failed', error)
    } finally {
      setBusy(false)
    }
  }

  const selectedQuery = selectedId ? queries.find((q) => q.id === selectedId) : null

  return (
    <div className="h-full grid grid-cols-12 gap-4 p-4">
      <div className="col-span-4 flex flex-col bg-black/30 border border-white/10 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/5 space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Saved Queries</h2>
            <p className="text-xs text-white/60">Manage reusable GraphQL queries for dashboards and analysis.</p>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or text"
            className="w-full bg-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            onClick={handleReset}
            className="w-full px-3 py-2 bg-teal-600 hover:bg-teal-500 rounded text-sm font-medium"
          >
            New Query
          </button>
        </div>
        <div className="flex-1 overflow-auto divide-y divide-white/5">
          {filteredQueries.map((query) => {
            const isSelected = query.id === selectedId
            return (
              <div
                key={query.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(query.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedId(query.id)
                  }
                }}
                className={`w-full text-left px-4 py-3 transition-colors cursor-pointer outline-none ${
                  isSelected ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/5 focus-visible:ring-1 focus-visible:ring-teal-400'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white line-clamp-1">{query.name}</div>
                    <div className="text-xs text-white/50 mt-1 line-clamp-2">{query.gql}</div>
                  </div>
                  {query.shapeHint && (
                    <span className="text-[11px] font-semibold text-teal-300 bg-teal-500/20 rounded px-2 py-0.5">{getShapeLabel(query.shapeHint)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] text-white/40">
                  <span>{new Date(query.updatedAt ?? '').toLocaleString()}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation()
                        setName(query.name)
                        setText(query.gql)
                        setShapeHint(query.shapeHint)
                        setRunState(null)
                        setSelectedId(query.id)
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDuplicate(query)
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="text-red-400 hover:text-red-200"
                      onClick={(event) => {
                        event.stopPropagation()
                        setConfirmDialog({
                          isOpen: true,
                          queryId: query.id,
                          message: `Delete “${query.name}”? This cannot be undone.`,
                        })
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
          {filteredQueries.length === 0 && (
            <div className="p-6 text-sm text-white/50">No saved queries found. Use “New Query” to create one.</div>
          )}
        </div>
      </div>

      <div className="col-span-8 flex flex-col bg-black/20 border border-white/10 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <div>
            <h3 className="text-lg font-semibold text-white">{selectedQuery ? 'Edit Query' : 'New Query'}</h3>
            <p className="text-xs text-white/60">Run and save queries with automatic shape detection for dashboards.</p>
          </div>
          {runState?.shape && (
            <div className="flex items-center gap-2 text-xs text-white/70">
              <span>Detected shape:</span>
              <span className="px-2 py-1 rounded bg-white/10 text-white font-medium">
                {getShapeLabel(runState.shape.shape)}
              </span>
              <span className="text-white/40">({runState.shape.confidence} confidence)</span>
            </div>
          )}
        </div>

        <div className="p-5 space-y-4 overflow-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-white/60 block">Name</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My Entities by Type"
                className="w-full bg-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/60 block">Shape hint</label>
              <select
                value={shapeHint ?? ''}
                onChange={(event) => setShapeHint(event.target.value || undefined)}
                className="w-full bg-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Auto-detect</option>
                <option value="entities">entities[]</option>
                <option value="counts">counts[]</option>
                <option value="metric">metric</option>
                <option value="geo">geo[]</option>
                <option value="items">items[]</option>
                <option value="unknown">unknown</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-white/60 block">GraphQL</label>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="w-full h-56 bg-black/40 border border-white/10 rounded-lg p-3 font-mono text-sm text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleRun}
              disabled={busy}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium"
            >
              Run
            </button>
            <button
              onClick={handleSave}
              disabled={busy}
              className="px-4 py-2 rounded bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-sm font-medium"
            >
              {selectedId ? 'Save Changes' : 'Save Query'}
            </button>
            <button
              onClick={handleReset}
              disabled={busy}
              className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 text-sm font-medium"
            >
              Reset
            </button>
          </div>

          {runState && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">Last Run</h4>
                {runState.executedAt && (
                  <span className="text-[11px] text-white/40">{new Date(runState.executedAt).toLocaleString()}</span>
                )}
              </div>
              {runState.error ? (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {runState.error}
                </div>
              ) : (
                <pre className="max-h-64 overflow-auto bg-black/40 border border-white/10 rounded-lg p-3 text-xs text-white">
                  {JSON.stringify(runState.data, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        isOpen={alertDialog.isOpen}
        onClose={() => setAlertDialog({ ...alertDialog, isOpen: false })}
        title={alertDialog.title}
        message={alertDialog.message}
        variant={alertDialog.variant}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, queryId: null, message: '' })}
        onConfirm={handleDelete}
        title="Delete Query"
        message={confirmDialog.message}
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />
    </div>
  )
}
