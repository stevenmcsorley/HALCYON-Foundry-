import type { DashboardExportV1, DashboardExportPanel } from "@/types/dashboardExport"
import { validateDashboardExport } from "@/lib/validateDashboardExport"
import { savedApi, type Dashboard, type DashboardPanel } from "./savedStore"

function hasRoleAny(userRoles: string[], requiredRoles: string[]): boolean {
  if (requiredRoles.length === 0) return true
  return requiredRoles.some(role => userRoles.includes(role))
}

function clampRefresh(v?: number): number | undefined {
  if (v == null) return undefined
  if (v < 5) return 5
  if (v > 86400) return 86400
  return v
}

/** Export a dashboard + its panels to the portable JSON format (v1). */
export async function exportDashboardToJson(dashboardId: string): Promise<DashboardExportV1> {
  const dash = await savedApi.getDashboard(dashboardId)
  const panels = dash.panels || []

  // Get all queries to map IDs to names
  const queries = await savedApi.getQueries()
  const queryMap = new Map(queries.map(q => [q.id, q.name]))

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    meta: { notes: `Exported from ${location.host}` },
    dashboard: {
      id: dash.id,
      name: dash.name,
      visibilityRoles: dash.visibilityRoles ?? [],
      config: dash.config ?? {}
    },
    panels: panels.map((p) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      queryRef: p.queryId ? (queryMap.has(p.queryId) 
        ? { name: queryMap.get(p.queryId)! }
        : { id: p.queryId }
      ) : undefined,
      refreshSec: p.refreshSec,
      config: p.config ?? {}
    }))
  }
}

/** Import from JSON, remapping queryRef by id or name. Returns new dashboard id. */
export async function importDashboardFromJson(json: unknown): Promise<{ dashboardId: string; unresolvedQueries: string[] }> {
  const vr = validateDashboardExport(json)
  if (!vr.ok) {
    const msg = vr.errors.map(e => `${e.path}: ${e.message}`).join("; ")
    throw new Error(`Invalid dashboard export: ${msg}`)
  }
  const data = vr.data

  // 1) Create new dashboard (ignore incoming id; keep name/roles/config)
  const newDashboard = await savedApi.createDashboard({
    name: data.dashboard.name,
    visibilityRoles: data.dashboard.visibilityRoles ?? [],
    config: data.dashboard.config ?? {}
  })

  // Update with visibilityRoles if backend supports it
  if (data.dashboard.visibilityRoles && data.dashboard.visibilityRoles.length > 0) {
    await savedApi.updateDashboard(newDashboard.id, {
      visibilityRoles: data.dashboard.visibilityRoles
    })
  }

  // 2) Resolve queries
  const allQueries = await savedApi.getQueries()
  const unresolved: string[] = []

  function resolveQueryId(qr: DashboardExportPanel["queryRef"] | undefined): string | undefined {
    if (!qr) return undefined

    if ("id" in qr && qr.id) {
      const exists = allQueries.some(q => q.id === qr.id)
      if (exists) return qr.id
    }

    if ("name" in qr && qr.name) {
      const byName = allQueries.find(q => q.name?.toLowerCase() === qr.name.toLowerCase())
      if (byName) return byName.id
      unresolved.push(qr.name)
    }

    return undefined
  }

  // 3) Create panels
  for (const p of data.panels) {
    const queryId = resolveQueryId(p.queryRef)
    await savedApi.createPanel(newDashboard.id, {
      title: p.title,
      type: p.type,
      queryId,
      refreshSec: clampRefresh(p.refreshSec),
      config: p.config ?? {}
    })
  }

  return { dashboardId: newDashboard.id, unresolvedQueries: unresolved }
}

/** Helper to filter dashboards by role (use in listing). */
export function filterDashboardsByRole(dashboards: Dashboard[], userRoles: string[]): Dashboard[] {
  return dashboards.filter(d => {
    const need = (d.visibilityRoles ?? []) as string[]
    return need.length === 0 || hasRoleAny(userRoles, need)
  })
}
