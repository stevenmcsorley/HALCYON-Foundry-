import React from 'react'
import { useSavedStore, savedApi } from '@/store/savedStore'
import { gql } from '@/services/api'
import { AlertDialog } from '@/components/AlertDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'

export default function SavedQueriesPanel() {
  const { queries, loadQueries } = useSavedStore()
  const [name, setName] = React.useState('')
  const [text, setText] = React.useState('query { health }')
  const [busy, setBusy] = React.useState(false)
  const [runOut, setRunOut] = React.useState<any>(null)
  const [alertDialog, setAlertDialog] = React.useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: ''
  })
  const [confirmDialog, setConfirmDialog] = React.useState<{ isOpen: boolean; queryId: string | null }>({
    isOpen: false,
    queryId: null
  })

  React.useEffect(() => {
    loadQueries()
  }, [loadQueries])

  const save = async () => {
    setBusy(true)
    try {
      await savedApi.createQuery({ name: name || 'Untitled', gql: text })
      await loadQueries()
      setName('')
      setText('query { health }')
    } catch (e: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Error',
        message: e.message || 'Failed to save query'
      })
    } finally {
      setBusy(false)
    }
  }

  const run = async (q: string) => {
    setBusy(true)
    try {
      const data = await gql<any>(q, {})
      setRunOut(data)
    } catch (e: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Error',
        message: e.message || 'Failed to run query'
      })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (confirmDialog.queryId) {
      const queryId = confirmDialog.queryId
      await savedApi.deleteQuery(queryId)
      await loadQueries()
      setConfirmDialog({ isOpen: false, queryId: null })
    }
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex gap-2">
        <input
          className="bg-black/30 rounded px-2 py-1 w-60 text-white"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="px-3 py-1 bg-white/10 rounded hover:bg-white/20 disabled:opacity-50"
          onClick={save}
          disabled={busy || !text.trim()}
        >
          Save Query
        </button>
      </div>
      <textarea
        className="w-full h-40 bg-black/30 rounded p-2 font-mono text-white"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2 items-center">
        <button
          className="px-3 py-1 bg-white/10 rounded hover:bg-white/20 disabled:opacity-50"
          onClick={() => run(text)}
          disabled={busy}
        >
          Run
        </button>
      </div>

      <h4 className="mt-4 opacity-70 text-white">Saved</h4>
      <ul className="space-y-1">
        {queries.map((q) => (
          <li key={q.id} className="flex items-center justify-between bg-black/20 rounded p-2">
            <div className="opacity-90 text-white">{q.name}</div>
            <div className="flex gap-2">
              <button
                className="text-xs opacity-80 hover:opacity-100 text-white"
                onClick={() => run(q.gql)}
              >
                Run
              </button>
              <button
                className="text-xs opacity-80 hover:opacity-100 text-white"
                onClick={() => {
                  setConfirmDialog({ isOpen: true, queryId: q.id })
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {runOut && (
        <div className="mt-3">
          <h4 className="opacity-70 text-white">Result</h4>
          <pre className="text-xs bg-black/30 rounded p-2 overflow-auto max-h-64 text-white">
            {JSON.stringify(runOut, null, 2)}
          </pre>
        </div>
      )}

      <AlertDialog
        isOpen={alertDialog.isOpen}
        onClose={() => setAlertDialog({ isOpen: false, title: '', message: '' })}
        title={alertDialog.title}
        message={alertDialog.message}
        variant="error"
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, queryId: null })}
        onConfirm={handleDelete}
        title="Delete Query"
        message="Delete this query? This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger={true}
      />
    </div>
  )
}
