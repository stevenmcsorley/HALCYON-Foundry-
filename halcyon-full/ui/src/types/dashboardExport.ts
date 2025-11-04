export type PanelType =
  | "map"
  | "graph"
  | "list"
  | "timeline"
  | "metric"
  | "table"
  | "topbar"
  | "geoheat"

export type QueryRef =
  | { id: string; name?: never }
  | { name: string; id?: never }

export interface DashboardExportPanel {
  id?: string
  title: string
  type: PanelType
  queryRef?: QueryRef
  refreshSec?: number
  config?: Record<string, unknown>
}

export interface DashboardExportDashboard {
  id?: string
  name: string
  visibilityRoles?: string[]
  config?: Record<string, unknown>
}

export interface DashboardExportMeta {
  compat?: Record<string, unknown>
  notes?: string
}

export interface DashboardExportV1 {
  version: 1
  exportedAt?: string
  meta?: DashboardExportMeta
  dashboard: DashboardExportDashboard
  panels: DashboardExportPanel[]
}
