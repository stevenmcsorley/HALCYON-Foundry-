import React from 'react'
import { useSavedStore, savedApi, type PanelType, type DashboardPanel, type SavedQuery } from '@/store/savedStore'
import PanelLibrary from './PanelLibrary'
import PanelRenderer from './PanelRenderer'

export default function DashboardEditor() {
  const { dashboards, panels, queries, loadDashboards, loadPanels, loadQueries } = useSavedStore()
  const [current, setCurrent] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    loadDashboards()
    loadQueries()
  }, [loadDashboards, loadQueries])

  React.useEffect(() => {
    if (current) {
      loadPanels(current)
    }
  }, [current, loadPanels])

  const currPanels = current ? panels[current] || [] : []

  const addPanel = async (type: PanelType, queryId: string) => {
    if (!current) return

    setBusy(true)
    try {
      await savedApi.createPanel(current, {
        title: `${type} panel`,
        type,
        queryId,
        refreshSec: 30,
        position: currPanels.length,
      })
      await loadPanels(current)
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const removePanel = async (id: string) => {
    if (!current) return

    setBusy(true)
    try {
      await savedApi.deletePanel(current, id)
      await loadPanels(current)
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const handleNewDashboard = async () => {
    const name = prompt('Name your dashboard') || 'Untitled'
    if (!name) return

    setBusy(true)
    try {
      const d = await savedApi.createDashboard({ name })
      await loadDashboards()
      setCurrent(d.id)
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-2 items-center">
        <select
          className="bg-black/30 rounded px-2 py-1 text-white"
          value={current ?? ''}
          onChange={(e) => setCurrent(e.target.value || null)}
        >
          <option value="">— Select dashboard —</option>
          {dashboards.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button
          className="px-2 py-1 bg-white/10 rounded hover:bg-white/20 disabled:opacity-50 text-white"
          onClick={handleNewDashboard}
          disabled={busy}
        >
          New Dashboard
        </button>
      </div>

      {current && (
        <>
          <div className="bg-black/20 rounded p-3">
            <div className="font-semibold mb-2 text-white">Add panel</div>
            <div className="flex gap-2 items-center">
              <PanelLibrary
                onPick={(type) => {
                  const q = queries[0]
                  if (!q) {
                    alert('Create a Saved Query first')
                    return
                  }
                  addPanel(type, q.id)
                }}
              />
              <div className="text-xs opacity-70 text-white">
                Uses first saved query by default; later choose per-panel.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {currPanels.map((p) => {
              const query: SavedQuery | undefined = queries.find((q) => q.id === p.queryId)
              return (
                <div key={p.id} className="bg-black/20 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-white">{p.title}</div>
                    <div className="flex gap-2">
                      <button
                        className="text-xs opacity-80 hover:opacity-100 text-white"
                        onClick={() => {
                          if (confirm('Remove this panel?')) {
                            removePanel(p.id)
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {query ? (
                    <PanelRenderer type={p.type} query={query} />
                  ) : (
                    <div className="opacity-70 text-sm text-white">Missing query</div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
