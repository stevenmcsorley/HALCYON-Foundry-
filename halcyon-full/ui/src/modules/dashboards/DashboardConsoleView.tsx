import React from 'react'
import { useNavigate } from 'react-router-dom'
import PanelRenderer from './PanelRenderer'
import { Card } from '@/components/Card'
import { useSavedStore, type DashboardPanel, type SavedQuery } from '@/store/savedStore'

export default function DashboardConsoleView(): JSX.Element {
  const navigate = useNavigate()
  const {
    defaultDashboardId,
    dashboards,
    panels,
    queries,
    loadDashboards,
    loadPanels,
    loadQueries,
    loading,
  } = useSavedStore()

  const [initialised, setInitialised] = React.useState(false)

  React.useEffect(() => {
    if (!initialised) {
      loadDashboards()
      loadQueries()
      setInitialised(true)
    }
  }, [initialised, loadDashboards, loadQueries])

  React.useEffect(() => {
    if (defaultDashboardId) {
      loadPanels(defaultDashboardId)
    }
  }, [defaultDashboardId, loadPanels])

  const dashboard = defaultDashboardId
    ? dashboards.find((d) => d.id === defaultDashboardId) ?? null
    : null

  const panelList: DashboardPanel[] = React.useMemo(() => {
    if (!defaultDashboardId) return []
    const list = panels[defaultDashboardId]
    if (!list) return []
    return [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }, [defaultDashboardId, panels])

  const getQuery = React.useCallback(
    (id: string | undefined): SavedQuery | null => {
      if (!id) return null
      return queries.find((q) => q.id === id) ?? null
    },
    [queries]
  )

  const dashboardDescription = React.useMemo(() => {
    if (!dashboard) return null
    const config = dashboard.config as Record<string, unknown> | undefined
    if (!config) return null
    const description = config['description']
    return typeof description === 'string' ? description : null
  }, [dashboard])

  if (loading && !dashboard) {
    return (
      <div className="flex h-full items-center justify-center text-white/70">
        Loading dashboard…
      </div>
    )
  }

  if (!defaultDashboardId || !dashboard) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/5 text-center text-white/70 p-8">
        <p className="text-base font-medium text-white">Set a default dashboard</p>
        <p className="text-sm text-white/60 max-w-lg">
          Choose “Use on console” for one of your dashboards and the console will render it here.
        </p>
        <button
          onClick={() => navigate('/dashboards')}
          className="px-3 py-2 rounded bg-teal-600 hover:bg-teal-500 text-white text-sm"
        >
          Open Dashboard Studio
        </button>
      </div>
    )
  }

  if (!panelList.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/5 text-center text-white/70 p-8">
        <p className="text-base font-medium text-white">{dashboard.name} has no panels yet</p>
        <p className="text-sm text-white/60 max-w-lg">
          Add panels in the Dashboard Studio and they will appear here automatically.
        </p>
        <button
          onClick={() => navigate('/dashboards')}
          className="px-3 py-2 rounded bg-teal-600 hover:bg-teal-500 text-white text-sm"
        >
          Add panels
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">{dashboard.name}</h3>
            <span className="rounded-full border border-teal-400/40 bg-teal-500/10 px-2 py-[2px] text-[10px] uppercase tracking-wide text-teal-200">
              Console default
            </span>
          </div>
          {dashboardDescription && (
            <p className="text-sm text-white/60 max-w-3xl">{dashboardDescription}</p>
          )}
        </div>
        <button
          onClick={() => navigate('/dashboards')}
          className="self-start rounded bg-white/10 px-3 py-2 text-sm text-white transition hover:bg-white/20"
        >
          Edit in Dashboard Studio
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="grid h-full min-h-0 gap-4 md:grid-cols-2 auto-rows-[minmax(280px,1fr)]">
          {panelList.map((panel) => {
            const query = getQuery(panel.queryId)
            return (
              <Card key={panel.id} title={panel.title}>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <PanelRenderer
                    type={panel.type}
                    query={query}
                    refreshSec={panel.refreshSec}
                    config={panel.config}
                  />
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

