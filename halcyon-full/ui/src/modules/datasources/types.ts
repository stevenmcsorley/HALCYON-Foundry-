export type DatasourceStatus = 'draft' | 'active' | 'disabled' | 'error'

export interface DatasourceState {
  workerStatus?: 'starting' | 'running' | 'stopped' | 'error' | string
  lastHeartbeatAt?: string
  lastEventAt?: string
  errorCode?: string
  errorMessage?: string
  metrics?: Record<string, any>
  metricsSnapshot?: Record<string, any>
  updatedAt?: string
}

export interface Datasource {
  id: string
  name: string
  type: string
  description?: string
  status: DatasourceStatus
  ownerId?: string
  orgId?: string
  projectId?: string
  tags: string[]
  createdAt?: string
  createdBy?: string
  updatedAt?: string
  updatedBy?: string
  archivedAt?: string | null
  currentVersion?: number
  state?: DatasourceState | null
}

export interface DatasourceVersion {
  version: number
  state: 'draft' | 'published' | 'archived' | string
  config: Record<string, any>
  summary?: string | null
  createdAt: string
  createdBy?: string | null
  approvedAt?: string | null
  approvedBy?: string | null
}

export interface DatasourceEvent {
  id: number
  version?: number | null
  eventType: string
  actor?: string | null
  payload: Record<string, any>
  createdAt: string
}

export interface DatasourceSecret {
  key: string
  version: number
  createdAt: string
  createdBy?: string | null
  rotatedAt?: string | null
  rotatedBy?: string | null
}

export interface DatasourceTestResult {
  success: boolean
  output?: any
  warnings?: string[]
  logs?: string[]
}

