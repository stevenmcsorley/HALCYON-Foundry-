import { create } from 'zustand'
import * as auth from '@/services/auth'
import { QueryShape } from '@/lib/queryShapes'

export type SavedQuery = {
  id: string
  name: string
  gql: string
  owner?: string
  shapeHint?: QueryShape
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
  isDefault?: boolean
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

function mapSavedQuery(raw: any): SavedQuery {
  return {
    id: raw.id,
    name: raw.name,
    gql: raw.gql,
    owner: raw.owner,
    shapeHint: raw.shape_hint ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

function mapDashboard(raw: any): Dashboard {
  const rawConfig = raw.config ?? raw.config_json ?? {}
  const config = typeof rawConfig === 'string' ? safeJsonParse(rawConfig) : (rawConfig ?? {})
  const configObj = (config || {}) as Record<string, unknown>
  const inferredDefault = typeof configObj.isDefault === 'boolean'
    ? Boolean(configObj.isDefault)
    : false
  const isDefault = raw.is_default ?? raw.isDefault ?? inferredDefault

  return {
    id: raw.id,
    name: raw.name,
    owner: raw.owner,
    visibilityRoles: raw.visibility_roles ?? raw.visibilityRoles,
    config,
    isDefault: Boolean(isDefault),
    createdAt: raw.created_at ?? raw.createdAt,
    updatedAt: raw.updated_at ?? raw.updatedAt,
  }
}

function mapPanel(raw: any): DashboardPanel {
  const rawConfig = raw.config ?? raw.config_json ?? raw.configJson ?? {}
  const config = typeof rawConfig === 'string' ? safeJsonParse(rawConfig) : (rawConfig ?? {})
  const configObj = (config || {}) as Record<string, unknown>

  return {
    id: raw.id,
    dashboardId: raw.dashboard_id ?? raw.dashboardId,
    title: raw.title,
    type: raw.type,
    refreshSec: (raw.refreshSec ?? configObj.refreshSec ?? raw.config?.refreshSec ?? raw.config_json?.refreshSec) as number | undefined,
    queryId: (raw.queryId ?? configObj.queryId ?? raw.config?.queryId ?? raw.config_json?.queryId) as string | undefined,
    config,
    position: raw.position ?? 0,
  }
}

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (err) {
    console.warn('Failed to parse dashboard config JSON', err)
    return {}
  }
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
    fetch(`${API}/saved-queries`, { headers: getAuthHeaders() })
      .then(j)
      .then((rows: any[]) => rows.map(mapSavedQuery)),
  
  createQuery: (q: Pick<SavedQuery, 'name' | 'gql'> & { shapeHint?: QueryShape }): Promise<SavedQuery> =>
    fetch(`${API}/saved-queries`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name: q.name,
        gql: q.gql,
        shape_hint: q.shapeHint ?? null,
      }),
    }).then(j).then(mapSavedQuery),
  
  updateQuery: (id: string, p: Partial<SavedQuery>): Promise<SavedQuery> =>
    fetch(`${API}/saved-queries/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ...(p.name !== undefined ? { name: p.name } : {}),
        ...(p.gql !== undefined ? { gql: p.gql } : {}),
        ...(p.shapeHint !== undefined ? { shape_hint: p.shapeHint } : {}),
      }),
    }).then(j).then(mapSavedQuery),
  
  deleteQuery: (id: string): Promise<void> =>
    fetch(`${API}/saved-queries/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).then(() => undefined),

  getDashboards: (): Promise<Dashboard[]> =>
    fetch(`${API}/dashboards`, { headers: getAuthHeaders() })
      .then(j)
      .then((rows: any[]) => rows.map(mapDashboard)),
  
  createDashboard: (d: Pick<Dashboard, 'name'> & { config?: Record<string, unknown>; isDefault?: boolean }): Promise<Dashboard> =>
    fetch(`${API}/dashboards`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name: d.name,
        config: d.config ?? {},
        is_default: d.isDefault ?? false,
      }),
    }).then(j).then(mapDashboard),
  
  updateDashboard: (id: string, p: Partial<Dashboard>): Promise<Dashboard> =>
    fetch(`${API}/dashboards/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ...(p.name !== undefined && { name: p.name }),
        ...(p.config !== undefined && { config: p.config ?? {} }),
        ...(p.isDefault !== undefined && { is_default: p.isDefault }),
      }),
    }).then(j).then(mapDashboard),

  setDefaultDashboard: (id: string): Promise<void> =>
    fetch(`${API}/dashboards/${id}/set-default`, {
      method: 'POST',
      headers: getAuthHeaders(),
    }).then(() => undefined),
  
  deleteDashboard: (id: string): Promise<void> =>
    fetch(`${API}/dashboards/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).then(() => undefined),

  getDashboard: (id: string): Promise<Dashboard & { panels: DashboardPanel[] }> =>
    fetch(`${API}/dashboards/${id}`, { headers: getAuthHeaders() })
      .then(j)
      .then((d: any) => {
        const mapped = mapDashboard(d)
        return {
          ...mapped,
          panels: (d.panels || []).map(mapPanel),
        }
      }),

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
    }).then(j).then(mapPanel),
  
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
    }).then(j).then(mapPanel),
  
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
  defaultDashboardId: string | null
  loadAll: () => Promise<void>
  loadQueries: () => Promise<void>
  loadDashboards: () => Promise<void>
  loadPanels: (dashboardId: string) => Promise<void>
  setDefaultDashboard: (dashboardId: string | null) => Promise<void>
}

export const useSavedStore = create<SavedState>((set, get) => ({
  queries: [],
  dashboards: [],
  panels: {},
  loading: false,
  defaultDashboardId: null,

  async loadAll() {
    set({ loading: true })
    try {
      const [qs, ds] = await Promise.all([savedApi.getQueries(), savedApi.getDashboards()])
      const defaultDashboard = ds.find((d) => d.isDefault)
      set({ queries: qs, dashboards: ds, defaultDashboardId: defaultDashboard?.id ?? null, loading: false })
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
    set({ loading: true })
    try {
      const dashboards = await savedApi.getDashboards()
      const defaultDashboard = dashboards.find((d) => d.isDefault)
      set({ dashboards, defaultDashboardId: defaultDashboard?.id ?? null, loading: false })
    } catch (e: any) {
      set({ error: String(e?.message || e), loading: false })
    }
  },

  async loadPanels(dashboardId: string) {
    set({ loading: true })
    try {
      const dashboard = await savedApi.getDashboard(dashboardId)
      const { panels: fetchedPanels, ...meta } = dashboard
      const dashboardsState = get().dashboards
      const mergedDashboards = dashboardsState.length
        ? dashboardsState.map((d) => (d.id === dashboardId ? { ...d, ...meta } : d))
        : [meta]
      const defaultDashboard = mergedDashboards.find((d) => d.isDefault)
      set({
        dashboards: mergedDashboards,
        defaultDashboardId: defaultDashboard?.id ?? get().defaultDashboardId,
        panels: {
          ...get().panels,
          [dashboardId]: fetchedPanels || []
        },
        loading: false
      })
    } catch (e: any) {
      set({ error: String(e?.message || e), loading: false })
    }
  },

  async setDefaultDashboard(dashboardId: string | null) {
    const previousDefault = get().defaultDashboardId
    const dashboardsState = get().dashboards

    // Optimistic state update
    const updatedDashboards = dashboardsState.map((d) => {
      if (dashboardId && d.id === dashboardId) {
        return { ...d, isDefault: true }
      }
      if (!dashboardId && previousDefault && d.id === previousDefault) {
        return { ...d, isDefault: false }
      }
      if (dashboardId && previousDefault && d.id === previousDefault) {
        return { ...d, isDefault: false }
      }
      return { ...d, isDefault: false }
    })

    try {
      set({ defaultDashboardId: dashboardId, dashboards: updatedDashboards })

      if (dashboardId) {
        await savedApi.setDefaultDashboard(dashboardId)
        await get().loadPanels(dashboardId)
      } else if (previousDefault) {
        await savedApi.updateDashboard(previousDefault, { isDefault: false })
      }

      await get().loadDashboards()
    } catch (e: any) {
      const revertedDashboards = dashboardsState.map((d) => {
        if (previousDefault && d.id === previousDefault) {
          return { ...d, isDefault: true }
        }
        if (dashboardId && d.id === dashboardId) {
          return { ...d, isDefault: false }
        }
        return d
      })

      set({ error: String(e?.message || e), defaultDashboardId: previousDefault ?? null, dashboards: revertedDashboards })
      throw e
    }
  },
}))
