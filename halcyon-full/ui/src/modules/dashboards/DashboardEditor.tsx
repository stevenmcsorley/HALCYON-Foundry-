import React from 'react'
import { useSavedStore, savedApi, type PanelType, type DashboardPanel, type SavedQuery, type Dashboard } from '@/store/savedStore'
import PanelLibrary from './PanelLibrary'
import PanelRenderer from './PanelRenderer'
import { exportDashboardToJson, importDashboardFromJson, filterDashboardsByRole } from '@/store/savedStore.dashboardIo'
import { useAuthStore } from '@/store/authStore'
import { showToast } from '@/components/Toast'
import { AlertDialog } from '@/components/AlertDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PromptDialog } from '@/components/PromptDialog'

export default function DashboardEditor() {
  const { dashboards, panels, queries, loadDashboards, loadPanels, loadQueries } = useSavedStore()
  const { user } = useAuthStore()
  const [current, setCurrent] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [editingName, setEditingName] = React.useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = React.useState('')
  
  // Modal states
  const [alertDialog, setAlertDialog] = React.useState<{ isOpen: boolean; title: string; message: string; variant?: 'error' | 'info' | 'success' }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info'
  })
  const [confirmDialog, setConfirmDialog] = React.useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; danger?: boolean }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    danger: false
  })
  const [promptDialog, setPromptDialog] = React.useState<{ isOpen: boolean; title: string; message: string; onConfirm: (value: string) => void; defaultValue?: string }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    defaultValue: ''
  })

  // Filter dashboards by role
  const userRoles = user?.roles || []
  const visibleDashboards = React.useMemo(() => {
    return filterDashboardsByRole(dashboards, userRoles)
  }, [dashboards, userRoles])

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

  const addPanel = async (type: PanelType, queryId?: string) => {
    if (!current) return

    setBusy(true)
    try {
      await savedApi.createPanel(current, {
        title: `${type} panel`,
        type,
        queryId: queryId || queries[0]?.id,
        refreshSec: 30,
        position: currPanels.length,
      })
      await loadPanels(current)
    } catch (e: any) {
      setAlertDialog({ isOpen: true, title: 'Error', message: e.message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const updatePanelQuery = async (panelId: string, queryId: string | undefined) => {
    if (!current) return
    try {
      await savedApi.updatePanel(current, panelId, { queryId })
      await loadPanels(current)
    } catch (e: any) {
      setAlertDialog({ isOpen: true, title: 'Error', message: e.message, variant: 'error' })
    }
  }

  const updatePanelRefresh = async (panelId: string, refreshSec: number | undefined) => {
    if (!current) return
    const clamped = refreshSec ? Math.max(5, Math.min(86400, refreshSec)) : undefined
    try {
      await savedApi.updatePanel(current, panelId, { refreshSec: clamped })
      await loadPanels(current)
    } catch (e: any) {
      setAlertDialog({ isOpen: true, title: 'Error', message: e.message, variant: 'error' })
    }
  }

  const renameDashboard = async (id: string, newName: string) => {
    try {
      await savedApi.updateDashboard(id, { name: newName })
      await loadDashboards()
      setEditingName(null)
    } catch (e: any) {
      setAlertDialog({ isOpen: true, title: 'Error', message: e.message, variant: 'error' })
    }
  }

  const duplicateDashboard = async (id: string) => {
    setBusy(true)
    try {
      const dash = await savedApi.getDashboard(id)
      const newDash = await savedApi.createDashboard({ 
        name: `${dash.name} (copy)`,
        visibilityRoles: dash.visibilityRoles,
        config: dash.config
      })
      for (const panel of dash.panels) {
        await savedApi.createPanel(newDash.id, {
          title: panel.title,
          type: panel.type,
          queryId: panel.queryId,
          refreshSec: panel.refreshSec,
          config: panel.config,
          position: panel.position
        })
      }
      await loadDashboards()
      setCurrent(newDash.id)
      showToast('Dashboard duplicated')
    } catch (e: any) {
      setAlertDialog({ isOpen: true, title: 'Error', message: e.message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const deleteDashboard = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Dashboard',
      message: 'Delete this dashboard? This cannot be undone.',
      danger: true,
      onConfirm: async () => {
    setBusy(true)
    try {
      await savedApi.deleteDashboard(id)
      await loadDashboards()
        if (current === id) setCurrent(null)
        showToast('Dashboard deleted')
      } catch (e: any) {
        setAlertDialog({ isOpen: true, title: 'Error', message: e.message, variant: 'error' })
      } finally {
        setBusy(false)
      }
    }
    })
  }

  const handleExport = async (id: string) => {
    try {
      const payload = await exportDashboardToJson(id)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const dash = dashboards.find(d => d.id === id)
      a.download = `${(dash?.name || 'dashboard').replace(/\s+/g, "_")}_export.json`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Dashboard exported')
    } catch (e: any) {
      setAlertDialog({ isOpen: true, title: 'Export Error', message: e.message, variant: 'error' })
    }
  }

  const handleImport = async (file: File) => {
    setBusy(true)
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const { dashboardId, unresolvedQueries } = await importDashboardFromJson(json)
      await loadDashboards()
      await loadQueries()
      setCurrent(dashboardId)
      if (unresolvedQueries.length > 0) {
        showToast(`Imported with ${unresolvedQueries.length} unresolved queries`)
      } else {
        showToast('Dashboard imported successfully')
      }
    } catch (e: any) {
      setAlertDialog({ isOpen: true, title: 'Import Error', message: e.message, variant: 'error' })
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
      setAlertDialog({ isOpen: true, title: 'Error', message: e.message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleNewDashboard = async () => {
    setPromptDialog({
      isOpen: true,
      title: 'New Dashboard',
      message: 'Name your dashboard',
      defaultValue: '',
      onConfirm: async (name) => {
        const dashboardName = name.trim() || 'Untitled'
        setBusy(true)
        try {
          const d = await savedApi.createDashboard({ name: dashboardName })
          await loadDashboards()
          setCurrent(d.id)
        } catch (e: any) {
          setAlertDialog({ isOpen: true, title: 'Error', message: e.message, variant: 'error' })
        } finally {
          setBusy(false)
        }
      }
    })
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-2 items-center flex-wrap">
        <select
          className="bg-black/30 rounded px-2 py-1 text-white"
          value={current ?? ''}
          onChange={(e) => {
            setCurrent(e.target.value || null)
            setEditingName(null)
          }}
        >
          <option value="">— Select dashboard —</option>
          {visibleDashboards.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button
          className="px-2 py-1 bg-white/10 rounded hover:bg-white/20 disabled:opacity-50 text-white text-sm"
          onClick={handleNewDashboard}
          disabled={busy}
        >
          New Dashboard
        </button>
        {current && (
          <>
            <button
              className="px-2 py-1 bg-teal-600 hover:bg-teal-700 rounded disabled:opacity-50 text-white text-sm"
              onClick={() => handleExport(current)}
              disabled={busy}
            >
              Export
            </button>
            <button
              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 text-white text-sm"
              onClick={() => duplicateDashboard(current)}
              disabled={busy}
            >
              Duplicate
            </button>
            <button
              className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded disabled:opacity-50 text-white text-sm"
              onClick={() => deleteDashboard(current)}
              disabled={busy}
            >
              Delete
            </button>
            <input
              type="file"
              accept="application/json"
              className="hidden"
              id="import-dashboard"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImport(file)
                e.target.value = '' // Reset input
              }}
            />
            <label
              htmlFor="import-dashboard"
              className="px-2 py-1 bg-purple-600 hover:bg-purple-700 rounded cursor-pointer disabled:opacity-50 text-white text-sm"
            >
              Import
            </label>
          </>
        )}
      </div>

      {current && (
        <div className="flex gap-2 items-center">
          {editingName === current ? (
            <>
              <input
                type="text"
                value={editingNameValue}
                onChange={(e) => setEditingNameValue(e.target.value)}
                onBlur={() => {
                  if (editingNameValue.trim()) {
                    renameDashboard(current, editingNameValue.trim())
                  } else {
                    setEditingName(null)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (editingNameValue.trim()) {
                      renameDashboard(current, editingNameValue.trim())
                    }
                  } else if (e.key === 'Escape') {
                    setEditingName(null)
                  }
                }}
                className="bg-black/30 rounded px-2 py-1 text-white"
                autoFocus
              />
            </>
          ) : (
            <>
              <span
                className="font-semibold text-white cursor-pointer hover:underline"
                onClick={() => {
                  const dash = dashboards.find(d => d.id === current)
                  setEditingNameValue(dash?.name || '')
                  setEditingName(current)
                }}
              >
                {dashboards.find(d => d.id === current)?.name || 'Untitled'}
              </span>
              <span className="text-xs opacity-70 text-white">(click to rename)</span>
            </>
          )}
        </div>
      )}

      {current && (
        <>
          <div className="bg-black/20 rounded p-3">
            <div className="font-semibold mb-2 text-white">Add panel</div>
            <div className="flex gap-2 items-center">
              <PanelLibrary
                onPick={(type) => {
                  addPanel(type, queries[0]?.id)
                }}
              />
              <div className="text-xs opacity-70 text-white">
                Panel query can be assigned after creation.
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
                          setConfirmDialog({
                            isOpen: true,
                            title: 'Remove Panel',
                            message: 'Remove this panel?',
                            danger: false,
                            onConfirm: () => removePanel(p.id)
                          })
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  
                  {/* Per-panel query selector */}
                  <div className="mb-2 space-y-1">
                    <label className="text-xs text-white/70 block">Query:</label>
                    <select
                      value={p.queryId || ''}
                      onChange={(e) => updatePanelQuery(p.id, e.target.value || undefined)}
                      className="w-full bg-black/30 rounded px-2 py-1 text-white text-xs"
                    >
                      <option value="">— No query —</option>
                      {queries.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Refresh interval */}
                  <div className="mb-2">
                    <label className="text-xs text-white/70 block">Refresh (sec):</label>
                    <input
                      type="number"
                      min="5"
                      max="86400"
                      value={p.refreshSec || 30}
                      onChange={(e) => updatePanelRefresh(p.id, e.target.value ? parseInt(e.target.value) : undefined)}
                      className="w-full bg-black/30 rounded px-2 py-1 text-white text-xs"
                    />
                  </div>

                  {query ? (
                    <PanelRenderer type={p.type} query={query} refreshSec={p.refreshSec} config={p.config} />
                  ) : (
                    <div className="opacity-70 text-sm text-white mt-2">Assign a query to render panel</div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Modals */}
      <AlertDialog
        isOpen={alertDialog.isOpen}
        onClose={() => setAlertDialog({ ...alertDialog, isOpen: false })}
        title={alertDialog.title}
        message={alertDialog.message}
        variant={alertDialog.variant}
      />
      
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        danger={confirmDialog.danger}
      />
      
      <PromptDialog
        isOpen={promptDialog.isOpen}
        onClose={() => setPromptDialog({ ...promptDialog, isOpen: false })}
        onConfirm={promptDialog.onConfirm}
        title={promptDialog.title}
        message={promptDialog.message}
        defaultValue={promptDialog.defaultValue}
      />
    </div>
  )
}
