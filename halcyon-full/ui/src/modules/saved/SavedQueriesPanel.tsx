import React from 'react'
import { useSavedStore, savedApi } from '@/store/savedStore'
import { gql } from '@/services/api'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorDialog } from '@/components/ErrorDialog'

export default function SavedQueriesPanel() {
  const { queries, loadQueries } = useSavedStore()
  const [name, setName] = React.useState('')
  const [text, setText] = React.useState('query { health }')
  const [busy, setBusy] = React.useState(false)
  const [runOut, setRunOut] = React.useState<any>(null)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [confirmAction, setConfirmAction] = React.useState<(() => void) | null>(null)
  const [errorOpen, setErrorOpen] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState('')

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
      setErrorMessage(`Error: ${e.message}`)
      setErrorOpen(true)
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
      setErrorMessage(`Error: ${e.message}`)
      setErrorOpen(true)
    } finally {
      setBusy(false)
    }
  }

  const deleteQuery = (id: string) => {
    setConfirmAction(() => async () => {
      try {
        await savedApi.deleteQuery(id)
        await loadQueries()
      } catch (e: any) {
        setErrorMessage(`Error: ${e.message}`)
        setErrorOpen(true)
      }
    })
    setConfirmOpen(true)
  }

  const handleConfirm = () => {
    if (confirmAction) {
      confirmAction()
      setConfirmAction(null)
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
                onClick={() => deleteQuery(q.id)}
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

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => {
          setConfirmOpen(false)
          setConfirmAction(null)
        }}
        onConfirm={handleConfirm}
        message="Delete this query?"
        variant="danger"
      />
      
      <ErrorDialog
        isOpen={errorOpen}
        onClose={() => setErrorOpen(false)}
        message={errorMessage}
      />
    </div>
  )
}
