import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { api } from '@/services/api'
import { showToast } from '@/components/Toast'
import type {
  Datasource,
  DatasourceEvent,
  DatasourceSecret,
  DatasourceTestResult,
  DatasourceVersion,
} from '@/modules/datasources/types'

type DatasourceFilters = {
  status?: string
  type?: string
  ownerId?: string
  search?: string
}

type LifecycleAction = 'start' | 'stop' | 'restart' | 'backfill'

type State = {
  items: Datasource[]
  loading: boolean
  selectedId?: string
  detail?: Datasource
  versions: DatasourceVersion[]
  events: DatasourceEvent[]
  secrets: DatasourceSecret[]
  testResult?: DatasourceTestResult
  filters: DatasourceFilters

  load: (filters?: DatasourceFilters) => Promise<void>
  select: (id: string | undefined) => Promise<void>
  create: (payload: Partial<Datasource>) => Promise<Datasource | undefined>
  update: (id: string, patch: Partial<Datasource>) => Promise<void>
  archive: (id: string) => Promise<void>
  lifecycle: (id: string, action: LifecycleAction) => Promise<void>
  publish: (id: string, version: number, comment?: string) => Promise<void>
  rollback: (id: string, version: number, comment?: string) => Promise<void>
  createVersion: (id: string, input: { config: Record<string, any>; summary?: string }) => Promise<void>
  loadVersions: (id: string) => Promise<void>
  loadEvents: (id: string) => Promise<void>
  runTest: (id: string, payload: Record<string, any>, options?: { version?: number; configOverride?: Record<string, any> }) => Promise<void>
  loadSecrets: (id: string) => Promise<void>
  upsertSecret: (id: string, key: string, value: string) => Promise<void>
  deleteSecret: (id: string, key: string) => Promise<void>
  setFilters: (filters: DatasourceFilters) => void
  clearTest: () => void
}

let missingEndpointNotified = false

function normalizeDatasource(ds: any): Datasource {
  const rawState = ds.state
  const state = rawState
    ? {
        workerStatus: rawState.workerStatus ?? rawState.worker_status,
        lastHeartbeatAt: rawState.lastHeartbeatAt ?? rawState.last_heartbeat_at,
        lastEventAt: rawState.lastEventAt ?? rawState.last_event_at,
        errorCode: rawState.errorCode ?? rawState.error_code,
        errorMessage: rawState.errorMessage ?? rawState.error_message,
        metrics: rawState.metrics ?? rawState.metrics_snapshot,
        metricsSnapshot: rawState.metricsSnapshot ?? rawState.metrics_snapshot,
        updatedAt: rawState.updatedAt ?? rawState.updated_at,
      }
    : undefined

  return {
    id: ds.id,
    name: ds.name,
    type: ds.type,
    description: ds.description,
    status: ds.status,
    ownerId: ds.ownerId ?? ds.owner_id,
    orgId: ds.orgId ?? ds.org_id,
    projectId: ds.projectId ?? ds.project_id,
    tags: ds.tags || [],
    createdAt: ds.createdAt ?? ds.created_at,
    createdBy: ds.createdBy ?? ds.created_by,
    updatedAt: ds.updatedAt ?? ds.updated_at,
    updatedBy: ds.updatedBy ?? ds.updated_by,
    archivedAt: ds.archivedAt ?? ds.archived_at,
    currentVersion: ds.currentVersion ?? ds.current_version,
    state,
  }
}

export const useDatasourceStore = create<State>()(
  devtools((set, get) => ({
    items: [],
    loading: false,
    versions: [],
    events: [],
    secrets: [],
    filters: {},

    load: async (filters) => {
      set({ loading: true, filters: filters ?? get().filters })
      try {
        const params = { ...get().filters, ...filters }
        const { data } = await api.get<Datasource[]>('/datasources', { params })
        set({ items: data.map(normalizeDatasource) })
      } catch (err: any) {
        const message = err?.message || 'Request failed'
        if (message.includes('404')) {
          if (!missingEndpointNotified) {
            showToast('Datasource API is not available yet. Deploy the Phase 11 backend to enable this view.')
            missingEndpointNotified = true
          }
          console.warn('Datasource API not available (404).', err)
          set({ items: [] })
        } else {
          console.error('Failed to load datasources', err)
          showToast(`Failed to load datasources: ${message}`)
        }
      } finally {
        set({ loading: false })
      }
    },

    select: async (id) => {
      set({ selectedId: id })
      if (!id) {
        set({ detail: undefined, versions: [], events: [], secrets: [], testResult: undefined })
        return
      }
      try {
        const { data } = await api.get(`/datasources/${id}`)
        set({ detail: normalizeDatasource(data) })
        await Promise.all([get().loadVersions(id), get().loadEvents(id), get().loadSecrets(id)])
      } catch (err: any) {
        console.error('Failed to fetch datasource', err)
        showToast(`Failed to open datasource: ${err.message}`)
      }
    },

    create: async (payload) => {
      try {
        const { data } = await api.post('/datasources', {
          name: payload.name,
          description: payload.description,
          type: payload.type,
          ownerId: payload.ownerId,
          orgId: payload.orgId,
          projectId: payload.projectId,
          tags: payload.tags ?? [],
        })
        const created = normalizeDatasource(data)
        showToast('Datasource draft created')
        await get().load()
        return created
      } catch (err: any) {
        const message = err?.message || 'Request failed'
        if (message.includes('404') && !missingEndpointNotified) {
          showToast('Datasource API is not available yet. Deploy the Phase 11 backend to enable this view.')
          missingEndpointNotified = true
        } else {
          console.error('Failed to create datasource', err)
          showToast(`Failed to create datasource: ${message}`)
        }
      }
      return undefined
    },

    update: async (id, patch) => {
      try {
        await api.put(`/datasources/${id}`, {
          name: patch.name,
          description: patch.description,
          ownerId: patch.ownerId,
          orgId: patch.orgId,
          projectId: patch.projectId,
          tags: patch.tags,
          status: patch.status,
        })
        showToast('Datasource updated')
        await get().load()
        if (get().selectedId === id) {
          await get().select(id)
        }
      } catch (err: any) {
        console.error('Failed to update datasource', err)
        showToast(`Failed to update datasource: ${err.message}`)
      }
    },

    archive: async (id) => {
      try {
        await api.delete(`/datasources/${id}`)
        showToast('Datasource archived')
        await get().load()
        if (get().selectedId === id) {
          set({ selectedId: undefined, detail: undefined, versions: [], events: [], secrets: [], testResult: undefined })
        }
      } catch (err: any) {
        console.error('Failed to archive datasource', err)
        showToast(`Failed to archive datasource: ${err.message}`)
      }
    },

    lifecycle: async (id, action) => {
      try {
        await api.post(`/datasources/${id}/${action}`)
        showToast(`Datasource ${action} request sent`)
        if (get().selectedId === id) {
          await get().select(id)
        } else {
          await get().load()
        }
      } catch (err: any) {
        console.error(`Failed to ${action} datasource`, err)
        showToast(`Failed to ${action} datasource: ${err.message}`)
      }
    },

    publish: async (id, version, comment) => {
      try {
        await api.post(`/datasources/${id}/publish`, { version, comment })
        showToast('Version published')
        await get().select(id)
      } catch (err: any) {
        console.error('Failed to publish datasource version', err)
        showToast(`Failed to publish version: ${err.message}`)
      }
    },

    rollback: async (id, version, comment) => {
      try {
        await api.post(`/datasources/${id}/rollback`, { targetVersion: version, comment })
        showToast('Rolled back to previous version')
        await get().select(id)
      } catch (err: any) {
        console.error('Failed to rollback datasource version', err)
        showToast(`Failed to rollback version: ${err.message}`)
      }
    },

    createVersion: async (id, input) => {
      try {
        await api.post(`/datasources/${id}/versions`, input)
        showToast('Draft version created')
        await get().loadVersions(id)
      } catch (err: any) {
        console.error('Failed to create datasource version', err)
        showToast(`Failed to create version: ${err.message}`)
      }
    },

    loadVersions: async (id) => {
      try {
        const { data } = await api.get<DatasourceVersion[]>(`/datasources/${id}/versions`)
        set({ versions: data })
      } catch (err: any) {
        console.error('Failed to load versions', err)
        showToast(`Failed to load versions: ${err.message}`)
      }
    },

    loadEvents: async (id) => {
      try {
        const { data } = await api.get<DatasourceEvent[]>(`/datasources/${id}/events`, { params: { limit: 100 } })
        set({ events: data })
      } catch (err: any) {
        console.error('Failed to load datasource events', err)
        showToast(`Failed to load events: ${err.message}`)
      }
    },

    runTest: async (id, payload, options) => {
      try {
        const body: any = { payload }
        if (options?.version !== undefined) {
          body.version = options.version
        }
        if (options?.configOverride) {
          body.configOverride = options.configOverride
        }
        const { data } = await api.post<DatasourceTestResult>(`/datasources/${id}/test`, body)
        set({ testResult: data })
        showToast(data.success ? 'Test run succeeded' : 'Test run failed')
      } catch (err: any) {
        console.error('Failed to run datasource test', err)
        showToast(`Failed to run test: ${err.message}`)
      }
    },

    loadSecrets: async (id) => {
      try {
        const { data } = await api.get<DatasourceSecret[]>(`/datasources/${id}/secrets`)
        set({ secrets: data })
      } catch (err: any) {
        console.error('Failed to load secrets', err)
        showToast(`Failed to load secrets: ${err.message}`)
      }
    },

    upsertSecret: async (id, key, value) => {
      try {
        await api.post(`/datasources/${id}/secrets`, { key, value })
        showToast('Secret saved')
        await get().loadSecrets(id)
      } catch (err: any) {
        console.error('Failed to save secret', err)
        showToast(`Failed to save secret: ${err.message}`)
      }
    },

    deleteSecret: async (id, key) => {
      try {
        await api.delete(`/datasources/${id}/secrets/${encodeURIComponent(key)}`)
        showToast('Secret removed')
        await get().loadSecrets(id)
      } catch (err: any) {
        console.error('Failed to delete secret', err)
        showToast(`Failed to delete secret: ${err.message}`)
      }
    },

    setFilters: (filters) => set({ filters }),

    clearTest: () => set({ testResult: undefined }),
  }))
)

