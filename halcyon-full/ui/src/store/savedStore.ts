import { create } from 'zustand'

export type SavedQuery = {
  id: string
  name: string
  gql: string
  owner?: string
  createdAt?: string
  updatedAt?: string
}

export type PanelType = 'map' | 'graph' | 'list' | 'timeline' | 'metric'

export type DashboardPanel = {
  id: string
  dashboardId: string
  title: string
  type: PanelType
  refreshSec?: number
  queryId: string
  config?: Record<string, unknown>
  position?: number
}

export type Dashboard = {
  id: string
  name: string
  owner?: string
  createdAt?: string
  updatedAt?: string
}

const API = import.meta.env.VITE_GATEWAY_URL?.replace(/\/graphql\/?$/, '') || 'http://localhost:8088'

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export const savedApi = {
  getQueries: (): Promise<SavedQuery[]> => 
    fetch(`${API}/saved-queries`, { credentials: 'include' }).then(j),
  
  createQuery: (q: Pick<SavedQuery, 'name' | 'gql'>): Promise<SavedQuery> =>
    fetch(`${API}/saved-queries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(q),
      credentials: 'include'
    }).then(j),
  
  updateQuery: (id: string, p: Partial<SavedQuery>): Promise<SavedQuery> =>
    fetch(`${API}/saved-queries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
      credentials: 'include'
    }).then(j),
  
  deleteQuery: (id: string): Promise<void> =>
    fetch(`${API}/saved-queries/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    }).then(() => undefined),

  getDashboards: (): Promise<Dashboard[]> => 
    fetch(`${API}/dashboards`, { credentials: 'include' }).then(j),
  
  createDashboard: (d: Pick<Dashboard, 'name'>): Promise<Dashboard> =>
    fetch(`${API}/dashboards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
      credentials: 'include'
    }).then(j),
  
  updateDashboard: (id: string, p: Partial<Dashboard>): Promise<Dashboard> =>
    fetch(`${API}/dashboards/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
      credentials: 'include'
    }).then(j),
  
  deleteDashboard: (id: string): Promise<void> =>
    fetch(`${API}/dashboards/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    }).then(() => undefined),

  getDashboard: (id: string): Promise<Dashboard & { panels: DashboardPanel[] }> =>
    fetch(`${API}/dashboards/${id}`, { credentials: 'include' }).then(j).then((d: any) => ({
      ...d,
      panels: (d.panels || []).map((p: any) => ({
        ...p,
        queryId: p.config?.queryId || p.config_json?.queryId,
        refreshSec: p.config?.refreshSec || p.config_json?.refreshSec,
        config: p.config || p.config_json || {},
      })),
    })),

  createPanel: (dashboardId: string, p: Omit<DashboardPanel, 'id' | 'dashboardId'>): Promise<DashboardPanel> =>
    fetch(`${API}/dashboards/${dashboardId}/panels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: p.title,
        type: p.type,
        position: p.position ?? 0,
        config_json: {
          ...(p.config || {}),
          queryId: p.queryId,
          refreshSec: p.refreshSec,
        },
      }),
      credentials: 'include'
    }).then(j).then((resp: any) => ({
      ...resp,
      queryId: resp.config?.queryId || resp.config_json?.queryId,
      refreshSec: resp.config?.refreshSec || resp.config_json?.refreshSec,
      config: resp.config || resp.config_json || {},
    })),
  
  updatePanel: (dashboardId: string, panelId: string, p: Partial<DashboardPanel>): Promise<DashboardPanel> =>
    fetch(`${API}/dashboards/${dashboardId}/panels/${panelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(p.title !== undefined && { title: p.title }),
        ...(p.type !== undefined && { type: p.type }),
        ...(p.position !== undefined && { position: p.position }),
        ...((p.config !== undefined || p.queryId !== undefined || p.refreshSec !== undefined) && {
          config_json: {
            ...(p.config || {}),
            ...(p.queryId !== undefined && { queryId: p.queryId }),
            ...(p.refreshSec !== undefined && { refreshSec: p.refreshSec }),
          },
        }),
      }),
      credentials: 'include'
    }).then(j).then((resp: any) => ({
      ...resp,
      queryId: resp.config?.queryId || resp.config_json?.queryId,
      refreshSec: resp.config?.refreshSec || resp.config_json?.refreshSec,
      config: resp.config || resp.config_json || {},
    })),
  
  deletePanel: (dashboardId: string, panelId: string): Promise<void> =>
    fetch(`${API}/dashboards/${dashboardId}/panels/${panelId}`, {
      method: 'DELETE',
      credentials: 'include'
    }).then(() => undefined),
}

type SavedState = {
  queries: SavedQuery[]
  dashboards: Dashboard[]
  panels: Record<string, DashboardPanel[]> // by dashboardId
  loading: boolean
  error?: string
  loadAll: () => Promise<void>
  loadQueries: () => Promise<void>
  loadDashboards: () => Promise<void>
  loadPanels: (dashboardId: string) => Promise<void>
}

export const useSavedStore = create<SavedState>((set, get) => ({
  queries: [],
  dashboards: [],
  panels: {},
  loading: false,

  async loadAll() {
    set({ loading: true })
    try {
      const [qs, ds] = await Promise.all([savedApi.getQueries(), savedApi.getDashboards()])
      set({ queries: qs, dashboards: ds, loading: false })
    } catch (e: any) {
      set({ loading: false, error: String(e?.message || e) })
    }
  },

  async loadQueries() {
    try {
      set({ queries: await savedApi.getQueries() })
    } catch (e: any) {
      set({ error: String(e?.message || e) })
    }
  },

  async loadDashboards() {
    try {
      set({ dashboards: await savedApi.getDashboards() })
    } catch (e: any) {
      set({ error: String(e?.message || e) })
    }
  },

  async loadPanels(dashboardId: string) {
    try {
      const dashboard = await savedApi.getDashboard(dashboardId)
      set({
        panels: {
          ...get().panels,
          [dashboardId]: dashboard.panels || []
        }
      })
    } catch (e: any) {
      set({ error: String(e?.message || e) })
    }
  },
}))
