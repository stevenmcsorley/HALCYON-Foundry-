import { create } from 'zustand'
import * as auth from '@/services/auth'

export type SavedQuery = {
  id: string
  name: string
  gql: string
  owner?: string
  createdAt?: string
  updatedAt?: string
}

export type PanelType = 'map' | 'graph' | 'list' | 'timeline' | 'metric' | 'table' | 'topbar' | 'geoheat'

export type DashboardPanel = {
  id: string
  dashboardId: string
  title: string
  type: PanelType
  refreshSec?: number
  queryId?: string
  config?: Record<string, unknown>
  position?: number
}

export type Dashboard = {
  id: string
  name: string
  owner?: string
  visibilityRoles?: string[]
  config?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

const API = import.meta.env.VITE_GATEWAY_URL?.replace(/\/graphql\/?$/, '') || 'http://localhost:8088'

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Handle 401 by attempting refresh (similar to api.ts)
    if (res.status === 401) {
      try {
        await auth.refresh()
        // Don't retry automatically here - let caller retry if needed
      } catch {
        // Refresh failed - will be handled by caller or auth service
      }
    }
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return res.json()
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = auth.getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export const savedApi = {
  getQueries: (): Promise<SavedQuery[]> => 
    fetch(`${API}/saved-queries`, { headers: getAuthHeaders() }).then(j),
  
  createQuery: (q: Pick<SavedQuery, 'name' | 'gql'>): Promise<SavedQuery> =>
    fetch(`${API}/saved-queries`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(q),
    }).then(j),
  
  updateQuery: (id: string, p: Partial<SavedQuery>): Promise<SavedQuery> =>
    fetch(`${API}/saved-queries/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(p),
    }).then(j),
  
  deleteQuery: (id: string): Promise<void> =>
    fetch(`${API}/saved-queries/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).then(() => undefined),

  getDashboards: (): Promise<Dashboard[]> => 
    fetch(`${API}/dashboards`, { headers: getAuthHeaders() }).then(j),
  
  createDashboard: (d: Pick<Dashboard, 'name'>): Promise<Dashboard> =>
    fetch(`${API}/dashboards`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(d),
    }).then(j),
  
  updateDashboard: (id: string, p: Partial<Dashboard>): Promise<Dashboard> =>
    fetch(`${API}/dashboards/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(p),
    }).then(j),
  
  deleteDashboard: (id: string): Promise<void> =>
    fetch(`${API}/dashboards/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).then(() => undefined),

  getDashboard: (id: string): Promise<Dashboard & { panels: DashboardPanel[] }> =>
    fetch(`${API}/dashboards/${id}`, { headers: getAuthHeaders() }).then(j).then((d: any) => ({
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
      headers: getAuthHeaders(),
      body: JSON.stringify({
        dashboard_id: dashboardId,
        title: p.title,
        type: p.type,
        position: p.position ?? 0,
        config_json: {
          ...(p.config || {}),
          queryId: p.queryId,
          refreshSec: p.refreshSec,
        },
      }),
    }).then(j).then((resp: any) => ({
      ...resp,
      queryId: resp.config?.queryId || resp.config_json?.queryId,
      refreshSec: resp.config?.refreshSec || resp.config_json?.refreshSec,
      config: resp.config || resp.config_json || {},
    })),
  
  updatePanel: (dashboardId: string, panelId: string, p: Partial<DashboardPanel>): Promise<DashboardPanel> =>
    fetch(`${API}/dashboards/${dashboardId}/panels/${panelId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
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
    }).then(j).then((resp: any) => ({
      ...resp,
      queryId: resp.config?.queryId || resp.config_json?.queryId,
      refreshSec: resp.config?.refreshSec || resp.config_json?.refreshSec,
      config: resp.config || resp.config_json || {},
    })),
  
  deletePanel: (dashboardId: string, panelId: string): Promise<void> =>
    fetch(`${API}/dashboards/${dashboardId}/panels/${panelId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
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
