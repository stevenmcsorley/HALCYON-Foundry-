// Note: Requires npm install ajv ajv-formats
// For now, we'll use a basic validation until ajv is available
import type { DashboardExportV1 } from "@/types/dashboardExport"

export type ValidationResult =
  | {
      ok: true
      data: DashboardExportV1
    }
  | {
      ok: false
      errors: { path: string; message: string }[]
    }

// Basic validation (can be replaced with AJV later)
export function validateDashboardExport(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, errors: [{ path: "", message: "Input must be an object" }] }
  }

  const obj = input as Record<string, unknown>

  // Check version
  if (obj.version !== 1) {
    return { ok: false, errors: [{ path: "/version", message: "Unsupported version (expected 1)" }] }
  }

  // Check dashboard
  if (!obj.dashboard || typeof obj.dashboard !== 'object') {
    return { ok: false, errors: [{ path: "/dashboard", message: "Missing or invalid dashboard" }] }
  }

  const dashboard = obj.dashboard as Record<string, unknown>
  if (!dashboard.name || typeof dashboard.name !== 'string') {
    return { ok: false, errors: [{ path: "/dashboard/name", message: "Dashboard name is required" }] }
  }

  // Check panels
  if (!Array.isArray(obj.panels)) {
    return { ok: false, errors: [{ path: "/panels", message: "Panels must be an array" }] }
  }

  for (let i = 0; i < obj.panels.length; i++) {
    const panel = obj.panels[i]
    if (typeof panel !== 'object' || panel === null) {
      return { ok: false, errors: [{ path: `/panels/${i}`, message: "Panel must be an object" }] }
    }
    const p = panel as Record<string, unknown>
    if (!p.title || typeof p.title !== 'string') {
      return { ok: false, errors: [{ path: `/panels/${i}/title`, message: "Panel title is required" }] }
    }
    if (!p.type || typeof p.type !== 'string') {
      return { ok: false, errors: [{ path: `/panels/${i}/type`, message: "Panel type is required" }] }
    }
  }

  return { ok: true, data: input as DashboardExportV1 }
}
