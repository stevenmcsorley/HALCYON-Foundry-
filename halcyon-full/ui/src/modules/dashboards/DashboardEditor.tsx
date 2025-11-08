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
import { isShapeCompatible, getExpectedShape, getShapeLabel, getPanelHint, type QueryShape } from '@/lib/queryShapes'
import { Card } from '@/components/Card'

export default function DashboardEditor() {
  const { dashboards, panels, queries, loadDashboards, loadPanels, loadQueries, defaultDashboardId, setDefaultDashboard } = useSavedStore()
  const { user } = useAuthStore()
  const [current, setCurrent] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [editingName, setEditingName] = React.useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [sidebarTab, setSidebarTab] = React.useState<'dashboards' | 'library'>('dashboards')
  
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
  const importInputRef = React.useRef<HTMLInputElement | null>(null)
  const [datasources, setDatasources] = React.useState<Array<{ id: string; name: string; status?: string }>>([])

  // Filter dashboards by role
  const userRoles = user?.roles || []
  const visibleDashboards = React.useMemo(() => {
    const filtered = filterDashboardsByRole(dashboards, userRoles)
    const term = search.trim().toLowerCase()
    if (!term) return filtered
    return filtered.filter((d) => d.name.toLowerCase().includes(term))
  }, [dashboards, userRoles, search])

  React.useEffect(() => {
    loadDashboards()
    loadQueries()
  }, [loadDashboards, loadQueries])

  React.useEffect(() => {
    let cancelled = false
    savedApi
      .listDatasources()
      .then((items) => {
        if (!cancelled) setDatasources(items)
      })
      .catch(() => {
        if (!cancelled) setDatasources([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (current) {
      loadPanels(current)
    }
  }, [current, loadPanels])

  const currPanels = current ? panels[current] || [] : []
  const selectedDashboard = current ? dashboards.find((d) => d.id === current) ?? null : null
  const selectedConfig = (selectedDashboard?.config as Record<string, unknown> | undefined) ?? undefined
  const dashboardDescription = selectedConfig && typeof selectedConfig['description'] === 'string'
    ? (selectedConfig['description'] as string)
    : null
  const isDefaultDashboard = selectedDashboard
    ? selectedDashboard.isDefault ?? selectedDashboard.id === defaultDashboardId
    : false
  const totalPanels = currPanels.length
  const totalLinkedQueries = currPanels.filter((p) => p.queryId).length
  const unassignedPanels = Math.max(0, totalPanels - totalLinkedQueries)

  const addPanel = async (type: PanelType, queryId?: string) => {
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
      setAlertDialog({ isOpen: true, title: 'Error', message: e.message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const updatePanelQuery = async (panelId: string, queryId: string | undefined) => {
    if (!current) return
    const panel = currPanels.find((p) => p.id === panelId)
    if (!panel) return

    if (queryId) {
      const query = queries.find((q) => q.id === queryId)
      const shape = query?.shapeHint ?? 'unknown'
      if (!isShapeCompatible(shape, panel.type)) {
        setAlertDialog({
          isOpen: true,
          title: 'Incompatible Query',
          message: `“${query?.name ?? 'Query'}” returns ${shape} data which is incompatible with the ${panel.type} panel. Choose a compatible query or update the query shape.`,
          variant: 'error',
        })
        return
      }
    }
    const nextConfig: Record<string, unknown> = {
      ...(panel.config || {}),
      ...(queryId !== undefined ? { queryId } : {}),
    }
    if (panel.refreshSec !== undefined) {
      nextConfig.refreshSec = panel.refreshSec
    }

    try {
      await savedApi.updatePanel(current, panelId, {
        queryId,
        refreshSec: panel.refreshSec,
        config: nextConfig,
      })
      await loadPanels(current)
    } catch (e: any) {
      setAlertDialog({ isOpen: true, title: 'Error', message: e.message, variant: 'error' })
    }
  }

  const updatePanelRefresh = async (panelId: string, refreshSec: number | undefined) => {
    if (!current) return
    const clamped = refreshSec ? Math.max(5, Math.min(86400, refreshSec)) : undefined
    const panel = currPanels.find((p) => p.id === panelId)
    const nextConfig: Record<string, unknown> = {
      ...(panel?.config || {}),
      ...(panel?.queryId ? { queryId: panel.queryId } : {}),
      ...(panel?.config?.liveSourceId ? { liveSourceId: panel.config.liveSourceId } : {}),
      ...(panel?.config?.liveLimit ? { liveLimit: panel.config.liveLimit } : {}),
    }
    if (clamped !== undefined) {
      nextConfig.refreshSec = clamped
    } else {
      delete nextConfig.refreshSec
    }
    try {
      await savedApi.updatePanel(current, panelId, { refreshSec: clamped, config: nextConfig })
      await loadPanels(current)
    } catch (e: any) {
      setAlertDialog({ isOpen: true, title: 'Error', message: e.message, variant: 'error' })
    }
  }

  const updatePanelLiveSource = async (panelId: string, sourceId: string | undefined) => {
    if (!current) return
    const panel = currPanels.find((p) => p.id === panelId)
    if (!panel) return
    const nextConfig: Record<string, unknown> = {
      ...(panel.config || {}),
      ...(panel.queryId ? { queryId: panel.queryId } : {}),
    }
    if (panel.refreshSec !== undefined) {
      nextConfig.refreshSec = panel.refreshSec
    }
    if (sourceId) {
      nextConfig.liveSourceId = sourceId
    } else {
      delete nextConfig.liveSourceId
    }

    try {
      await savedApi.updatePanel(current, panelId, {
        config: nextConfig,
        queryId: panel.queryId,
        refreshSec: panel.refreshSec,
      })
      await loadPanels(current)
    } catch (e: any) {
      setAlertDialog({ isOpen: true, title: 'Error', message: e.message, variant: 'error' })
    }
  }

  const updatePanelLiveLimit = async (panelId: string, liveLimit: number | undefined) => {
    if (!current) return
    const panel = currPanels.find((p) => p.id === panelId)
    if (!panel) return
    const nextConfig: Record<string, unknown> = {
      ...(panel.config || {}),
      ...(panel.queryId ? { queryId: panel.queryId } : {}),
    }
    if (panel.refreshSec !== undefined) {
      nextConfig.refreshSec = panel.refreshSec
    }
    if (panel.config?.liveSourceId) {
      nextConfig.liveSourceId = panel.config.liveSourceId
    }
    if (liveLimit && liveLimit > 0) {
      nextConfig.liveLimit = liveLimit
    } else {
      delete nextConfig.liveLimit
    }

    try {
      await savedApi.updatePanel(current, panelId, {
        config: nextConfig,
        queryId: panel.queryId,
        refreshSec: panel.refreshSec,
      })
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

  const handleSetDefaultDashboard = async (dashboardId: string | null) => {
    if (dashboardId && dashboardId === defaultDashboardId) {
      showToast('Already the console default')
      return
    }
    if (!dashboardId && !defaultDashboardId) {
      showToast('No default dashboard set')
      return
    }
    try {
      setBusy(true)
      await setDefaultDashboard(dashboardId)
      if (dashboardId) {
        showToast('Console home will load this dashboard by default')
      } else {
        showToast('Console default dashboard cleared')
      }
    } catch (e: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Default Dashboard',
        message: String(e?.message || e),
        variant: 'error'
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full px-4 pb-6 pt-4 overflow-hidden">
      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleImport(file)
          if (importInputRef.current) {
            importInputRef.current.value = ''
          }
        }}
      />

      <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[320px,minmax(0,1fr)] lg:grid-cols-[280px,minmax(0,1fr)]">
        <Card
          title="Workspace"
          header={
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-full bg-white/10 p-1">
                <button
                  onClick={() => setSidebarTab('dashboards')}
                  className={`flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
                    sidebarTab === 'dashboards'
                      ? 'bg-teal-600 text-white'
                      : 'text-white/70 hover:text-white'
                  }`}
                  aria-label="Dashboards"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path d="M3 3h6v6H3V3zm8 0h6v4h-6V3zM3 11h4v6H3v-6zm6 0h8v6H9v-6z" />
                  </svg>
                </button>
                <button
                  onClick={() => setSidebarTab('library')}
                  className={`flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
                    sidebarTab === 'library'
                      ? 'bg-teal-600 text-white'
                      : 'text-white/70 hover:text-white'
                  }`}
                  aria-label="Panel presets"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                    <path d="M4 7h16M4 12h10M4 17h7" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M17 16.5 19 18l3-3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              {sidebarTab === 'dashboards' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => importInputRef.current?.click()}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"
                    aria-label="Import dashboard"
                    disabled={busy}
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M10 14l4-4H6l4 4zm0-12a8 8 0 100 16 8 8 0 000-16z" />
                    </svg>
                  </button>
                  <button
                    onClick={handleNewDashboard}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
                    aria-label="New dashboard"
                    disabled={busy}
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          }
        >
          <div className="flex-1 overflow-auto p-3 space-y-3">
            {sidebarTab === 'dashboards' ? (
              <>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search dashboards"
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-teal-500"
                />

                <div className="space-y-2">
                  {visibleDashboards.length === 0 ? (
                    <div className="text-sm text-white/60 border border-dashed border-white/10 rounded-lg p-4">
                      {dashboards.length === 0
                        ? 'No dashboards yet. Create one to start composing a view.'
                        : 'No dashboards match that search.'}
                    </div>
                  ) : (
                    <ul className="space-y-1">
                      {visibleDashboards.map((dash) => {
                        const isActive = dash.id === current
                        const panelCount = panels[dash.id]?.length ?? 0
                        const isDefault = dash.isDefault ?? dash.id === defaultDashboardId
                        const dashConfig = dash.config as Record<string, unknown> | undefined
                        const description = dashConfig && typeof dashConfig['description'] === 'string'
                          ? (dashConfig['description'] as string)
                          : null
                        return (
                          <li key={dash.id}>
                            <button
                              onClick={() => {
                                setCurrent(dash.id)
                                setEditingName(null)
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                                isActive
                                  ? 'border-teal-500/80 bg-teal-500/10 text-white'
                                  : 'border-white/10 hover:border-white/20 text-white/80 hover:text-white'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium">{dash.name}</span>
                                <div className="flex items-center gap-2">
                                  {isDefault && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-teal-400/60 bg-teal-500/10 px-2 py-[2px] text-[10px] uppercase tracking-wide text-teal-200">
                                      ✓ Default
                                    </span>
                                  )}
                                  <span className="text-xs text-white/50">{panelCount} panels</span>
                                </div>
                              </div>
                              {description && (
                                <p className="text-xs text-white/40 mt-1 line-clamp-2">{description}</p>
                              )}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-white/60">
                  Drop-in visual building blocks. Pick a preset, then tune the query and settings on the right.
                </p>
                <div className="text-[11px] uppercase tracking-wide text-white/40">
                  {queries.length} saved queries available
                </div>
                <div className="space-y-2">
                  <PanelLibrary
                    onPick={(type) => {
                      addPanel(type)
                    }}
                    variant="single-column"
                  />
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/50">
                  Hint: assign saved queries to each panel in the “Panels” section.
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className="flex min-h-0 flex-col gap-4">
          {!selectedDashboard ? (
            <Card title="Pick a dashboard">
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6 text-white/60">
                <p className="text-base font-medium text-white/70">Select or create a dashboard to begin.</p>
                <p className="text-sm max-w-sm">
                  Dashboards stitch saved queries into rich panels. You can mix timelines, geo maps, entity tables, and metrics in a single view.
                </p>
              </div>
            </Card>
          ) : (
            <>
              <Card
                title="Dashboard overview"
                fill={false}
                header={
                  <div className="flex flex-wrap items-center gap-2">
                    {isDefaultDashboard ? (
                      <>
                        <span className="inline-flex items-center gap-1 rounded-full border border-teal-400/60 bg-teal-500/10 px-2 py-[2px] text-[11px] uppercase tracking-wide text-teal-200">
                          ✓ Default on console
                        </span>
                        <button
                          onClick={() => handleSetDefaultDashboard(null)}
                          className="px-2 py-1 text-xs rounded border border-white/20 text-white/80 hover:text-white hover:border-white/40 disabled:opacity-50"
                          disabled={busy}
                        >
                          Unset
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleSetDefaultDashboard(selectedDashboard.id)}
                        className="px-2 py-1 text-xs rounded bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
                        disabled={busy}
                      >
                        Use on console
                      </button>
                    )}
                    <div className="h-4 w-px bg-white/20" />
                    <button
                      onClick={() => handleExport(selectedDashboard.id)}
                      className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20 text-white disabled:opacity-50"
                      disabled={busy}
                    >
                      Export
                    </button>
                    <button
                      onClick={() => duplicateDashboard(selectedDashboard.id)}
                      className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                      disabled={busy}
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => deleteDashboard(selectedDashboard.id)}
                      className="px-2 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                      disabled={busy}
                    >
                      Delete
                    </button>
                  </div>
                }
              >
                <div className="p-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    {editingName === selectedDashboard.id ? (
                      <input
                        type="text"
                        value={editingNameValue}
                        onChange={(e) => setEditingNameValue(e.target.value)}
                        onBlur={() => {
                          if (editingNameValue.trim()) {
                            renameDashboard(selectedDashboard.id, editingNameValue.trim())
                          } else {
                            setEditingName(null)
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editingNameValue.trim()) {
                            renameDashboard(selectedDashboard.id, editingNameValue.trim())
                          }
                          if (e.key === 'Escape') {
                            setEditingName(null)
                          }
                        }}
                        className="bg-white/5 border border-teal-500/60 focus:border-teal-400 focus:outline-none rounded px-3 py-2 text-base text-white"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditingNameValue(selectedDashboard.name)
                          setEditingName(selectedDashboard.id)
                        }}
                        className="text-lg font-semibold text-white hover:text-teal-300"
                      >
                        {selectedDashboard.name}
                      </button>
                    )}
                    <span className="text-xs text-white/40">Click name to rename</span>
                  </div>

                  {dashboardDescription && (
                    <p className="text-sm text-white/60 max-w-3xl">{dashboardDescription}</p>
                  )}

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-white/50">Panels</div>
                      <div className="text-xl font-semibold text-white">{totalPanels}</div>
                    </div>
                    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-white/50">Panels with query</div>
                      <div className="text-xl font-semibold text-white">{totalLinkedQueries}</div>
                    </div>
                    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-white/50">Unassigned</div>
                      <div className={`text-xl font-semibold ${unassignedPanels > 0 ? 'text-amber-300' : 'text-white'}`}>{unassignedPanels}</div>
                    </div>
                  </div>
                </div>
              </Card>

              <Card title="Panels in this dashboard" className="min-h-[280px]">
                <div className="p-4 space-y-4 overflow-auto">
                  {currPanels.length === 0 ? (
                    <div className="border border-dashed border-white/10 rounded-lg p-6 text-center text-sm text-white/60">
                      No panels yet. Use the panel library above to add visual blocks.
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {currPanels.map((p) => {
                        const query: SavedQuery | undefined = queries.find((q) => q.id === p.queryId)
                        const expectedShape = getExpectedShape(p.type)
                        const shapeLabel = p.queryId ? getShapeLabel(query?.shapeHint ?? 'unknown') : getShapeLabel(expectedShape)
                        const panelConfig = (p.config || {}) as Record<string, any>
                        const liveSourceId = typeof panelConfig.liveSourceId === 'string' ? panelConfig.liveSourceId : ''
                        const liveLimit = panelConfig.liveLimit ? Number(panelConfig.liveLimit) : 200
                        const supportsLive = ['table', 'graph', 'geoheat', 'map', 'metric'].includes(p.type)
                        return (
                          <Card
                            key={p.id}
                            title={p.title}
                            header={
                              <button
                                className="text-[11px] uppercase tracking-wide text-rose-300 hover:text-rose-200"
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
                            }
                          >
                            <div className="p-3 flex flex-col gap-3 min-h-[220px]">
                              <div className="grid gap-2">
                                <div>
                                  <label className="text-xs text-white/60 block">Query</label>
                                  <div className="relative mt-1">
                                    <select
                                      data-panel-id={p.id}
                                      value={p.queryId || ''}
                                      onChange={(e) => updatePanelQuery(p.id, e.target.value || undefined)}
                                      className="w-full appearance-none rounded-md border border-white/15 bg-black/40 px-3 py-2 pr-8 text-sm text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                                    >
                                      <option value="">— No query —</option>
                                      {(() => {
                                        const compatible: SavedQuery[] = []
                                        const incompatible: SavedQuery[] = []

                                        queries.forEach((q) => {
                                          const shape: QueryShape = q.shapeHint || 'unknown'
                                          const ok = isShapeCompatible(shape, p.type)
                                          if (ok) compatible.push(q)
                                          else incompatible.push(q)
                                        })

                                        return (
                                          <>
                                            {compatible.length > 0 && (
                                              <optgroup label="✓ Compatible" className="text-white/70 bg-black">
                                                {compatible.map((q) => (
                                                  <option key={q.id} value={q.id}>
                                                    {q.name} {q.shapeHint && `[${getShapeLabel(q.shapeHint)}]`}
                                                  </option>
                                                ))}
                                              </optgroup>
                                            )}
                                            {incompatible.length > 0 && (
                                              <optgroup label="⚠ Incompatible" className="text-white/40 bg-black">
                                                {incompatible.map((q) => (
                                                  <option key={q.id} value={q.id} disabled>
                                                    {q.name} {q.shapeHint && `[${getShapeLabel(q.shapeHint)}]`}
                                                  </option>
                                                ))}
                                              </optgroup>
                                            )}
                                          </>
                                        )
                                      })()}
                                    </select>
                                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-white/40">
                                      ▾
                                    </span>
                                  </div>
                                  {!p.queryId && (
                                    <p className="text-xs text-white/45 italic mt-1">{getPanelHint(p.type)}</p>
                                  )}
                                </div>

                                {supportsLive && (
                                  <div className="grid gap-2">
                                    <div>
                                      <label className="text-xs text-white/60 block">Live Source</label>
                                      <div className="relative mt-1">
                                        <select
                                          value={liveSourceId}
                                          onChange={(e) => updatePanelLiveSource(p.id, e.target.value || undefined)}
                                          className="w-full appearance-none rounded-md border border-white/15 bg-black/40 px-3 py-2 pr-8 text-sm text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                                        >
                                          <option value="">— No live stream —</option>
                                          {datasources.map((ds) => (
                                            <option key={ds.id} value={ds.id}>
                                              {ds.name} {ds.status ? `(${ds.status})` : ''}
                                            </option>
                                          ))}
                                        </select>
                                        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-white/40">
                                          ▾
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-white/40 mt-1">
                                        Bind a datasource to stream dashboard updates via WebSocket.
                                      </p>
                                    </div>
                                    {liveSourceId && (
                                      <div className="grid grid-cols-[minmax(0,0.65fr)_minmax(0,1fr)] gap-2">
                                        <div>
                                          <label className="text-xs text-white/60 block">Live buffer (rows)</label>
                                          <input
                                            type="number"
                                            min={10}
                                            max={5000}
                                            value={liveLimit || 200}
                                            onChange={(e) =>
                                              updatePanelLiveLimit(
                                                p.id,
                                                e.target.value ? Math.max(10, Math.min(5000, parseInt(e.target.value, 10))) : undefined,
                                              )
                                            }
                                            className="mt-1 w-full bg-white/5 border border-emerald-500/40 rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                                          />
                                        </div>
                                        <div className="text-[11px] text-emerald-200/70 bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2">
                                          Streaming enabled – refresh interval is ignored while live updates arrive.
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs text-white/60 block">Refresh (sec)</label>
                                    <input
                                      type="number"
                                      min="5"
                                      max="86400"
                                      value={p.refreshSec || 30}
                                      onChange={(e) => updatePanelRefresh(p.id, e.target.value ? parseInt(e.target.value) : undefined)}
                                      disabled={Boolean(liveSourceId)}
                                      className="mt-1 w-full bg-white/5 border border-white/15 rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-teal-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                    />
                                    {liveSourceId && (
                                      <p className="text-[11px] text-white/45 mt-1">
                                        Refresh scheduling is paused while live streaming is active.
                                      </p>
                                    )}
                                  </div>
                                  <div>
                                    <label className="text-xs text-white/60 block">Expected shape</label>
                                    <div className="mt-1 text-xs text-white/50 px-2 py-2 bg-white/5 border border-white/10 rounded">
                                      {shapeLabel}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="flex-1 min-h-0 border border-white/10 rounded-lg overflow-hidden">
                                <PanelRenderer
                                  type={p.type}
                                  query={query || null}
                                  refreshSec={p.refreshSec}
                                  config={p.config}
                                  onQueryChange={() => {
                                    const selectEl = document.querySelector(`select[data-panel-id="${p.id}"]`) as HTMLSelectElement
                                    if (selectEl) {
                                      selectEl.focus()
                                      selectEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </div>
              </Card>
            </>
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
