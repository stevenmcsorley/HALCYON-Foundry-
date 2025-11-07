import { create } from "zustand";
import { api } from "@/services/api";

export type PlaybookMode = "suggest" | "dry_run" | "auto_run";

export interface PlaybookBinding {
  id: number;
  ruleId?: number | null;
  playbookId: string;
  mode: PlaybookMode;
  matchTypes: string[];
  matchSeverities: string[];
  matchTags: string[];
  maxPerMinute: number;
  maxConcurrent: number;
  dailyQuota: number;
  enabled: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlaybookRunAudit {
  id: string;
  alertId: number;
  bindingId?: number | null;
  playbookId: number;
  mode: PlaybookMode;
  decision: string;
  reason?: string | null;
  requestedBy?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  success?: boolean | null;
  outputRef?: string | null;
}

type State = {
  bindings: PlaybookBinding[];
  auditByAlertId: Record<number, PlaybookRunAudit[]>;
  previewByAlertId: Record<number, PlaybookRunAudit[]>;
  loading: boolean;
  error?: string;
  list: (params?: { ruleId?: number; enabled?: boolean; mode?: PlaybookMode }) => Promise<PlaybookBinding[]>;
  create: (input: Partial<PlaybookBinding>) => Promise<PlaybookBinding | undefined>;
  update: (id: number, input: Partial<PlaybookBinding>) => Promise<PlaybookBinding | undefined>;
  remove: (id: number) => Promise<boolean>;
  preview: (alertId: number) => Promise<PlaybookRunAudit[]>;
  run: (alertId: number, bindingId: number) => Promise<PlaybookRunAudit | undefined>;
  loadAudit: (alertId: number) => Promise<PlaybookRunAudit[]>;
  clearError: () => void;
};

function normalizeBinding(raw: any): PlaybookBinding {
  return {
    id: raw.id,
    ruleId: raw.ruleId ?? null,
    playbookId: raw.playbookId,
    mode: raw.mode,
    matchTypes: raw.matchTypes ?? [],
    matchSeverities: raw.matchSeverities ?? [],
    matchTags: raw.matchTags ?? [],
    maxPerMinute: raw.maxPerMinute ?? 30,
    maxConcurrent: raw.maxConcurrent ?? 5,
    dailyQuota: raw.dailyQuota ?? 500,
    enabled: raw.enabled ?? true,
    createdBy: raw.createdBy,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function normalizeAudit(raw: any): PlaybookRunAudit {
  return {
    id: String(raw.id),
    alertId: raw.alertId,
    bindingId: raw.bindingId ?? null,
    playbookId: raw.playbookId,
    mode: raw.mode,
    decision: raw.decision,
    reason: raw.reason,
    requestedBy: raw.requestedBy,
    startedAt: raw.startedAt,
    finishedAt: raw.finishedAt,
    success: raw.success,
    outputRef: raw.outputRef,
  };
}

export const useBindingsStore = create<State>((set, get) => ({
  bindings: [],
  auditByAlertId: {},
  previewByAlertId: {},
  loading: false,
  error: undefined,

  clearError: () => set({ error: undefined }),

  list: async (params) => {
    set({ loading: true });
    try {
      const res = await api.get<PlaybookBinding[]>("/bindings", { params });
      const normalized = (res.data ?? []).map(normalizeBinding);
      set({ bindings: normalized, loading: false, error: undefined });
      return normalized;
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.message || "Failed to load bindings";
      if (status === 401 || status === 403) {
        set({ loading: false });
        return [];
      }
      console.error("Failed to list bindings:", message);
      set({ loading: false, error: message });
      return [];
    }
  },

  create: async (input) => {
    try {
      const res = await api.post<PlaybookBinding>("/bindings", {
        ruleId: input.ruleId ?? null,
        playbookId: input.playbookId,
        mode: input.mode,
        matchTypes: input.matchTypes ?? [],
        matchSeverities: input.matchSeverities ?? [],
        matchTags: input.matchTags ?? [],
        maxPerMinute: input.maxPerMinute ?? 30,
        maxConcurrent: input.maxConcurrent ?? 5,
        dailyQuota: input.dailyQuota ?? 500,
        enabled: input.enabled ?? true,
      });
      const binding = normalizeBinding(res.data);
      set({ bindings: [...get().bindings, binding], error: undefined });
      return binding;
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.message || "Failed to create binding";
      if (status === 401 || status === 403) {
        set({ error: message });
        throw error;
      }
      console.error("Failed to create binding:", message);
      set({ error: message });
      throw error;
    }
  },

  update: async (id, input) => {
    try {
      const res = await api.put<PlaybookBinding>(`/bindings/${id}`, {
        ruleId: input.ruleId ?? null,
        playbookId: input.playbookId,
        mode: input.mode,
        matchTypes: input.matchTypes ?? [],
        matchSeverities: input.matchSeverities ?? [],
        matchTags: input.matchTags ?? [],
        maxPerMinute: input.maxPerMinute ?? 30,
        maxConcurrent: input.maxConcurrent ?? 5,
        dailyQuota: input.dailyQuota ?? 500,
        enabled: input.enabled ?? true,
      });
      const binding = normalizeBinding(res.data);
      set({
        bindings: get().bindings.map((b) => (b.id === binding.id ? binding : b)),
        error: undefined,
      });
      return binding;
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.message || "Failed to update binding";
      if (status === 401 || status === 403) {
        set({ error: message });
        throw error;
      }
      console.error("Failed to update binding:", message);
      set({ error: message });
      throw error;
    }
  },

  remove: async (id) => {
    try {
      await api.delete(`/bindings/${id}`);
      set({
        bindings: get().bindings.filter((b) => b.id !== id),
        error: undefined,
      });
      return true;
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.message || "Failed to delete binding";
      if (status === 401 || status === 403) {
        set({ error: message });
        return false;
      }
      console.error("Failed to delete binding:", message);
      set({ error: message });
      return false;
    }
  },

  preview: async (alertId) => {
    try {
      const res = await api.post<PlaybookRunAudit[]>(`/alerts/${alertId}/bindings/evaluate`);
      const audits = (res.data ?? []).map(normalizeAudit);
      set({
        previewByAlertId: { ...get().previewByAlertId, [alertId]: audits },
        error: undefined,
      });
      return audits;
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.message || "Failed to preview bindings";
      if (status === 401 || status === 403) {
        return [];
      }
      console.error("Failed to preview bindings:", message);
      set({ error: message });
      return [];
    }
  },

  run: async (alertId, bindingId) => {
    try {
      const res = await api.post<PlaybookRunAudit>(`/alerts/${alertId}/bindings/run`, {
        bindingId,
      });
      const audit = normalizeAudit(res.data);
      const existing = get().auditByAlertId[alertId] ?? [];
      set({
        auditByAlertId: {
          ...get().auditByAlertId,
          [alertId]: [audit, ...existing],
        },
        previewByAlertId: get().previewByAlertId,
        error: undefined,
      });
      // Refresh preview to reflect latest counters/decisions
      await get().preview(alertId);
      return audit;
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.message || "Failed to run binding";
      if (status === 401 || status === 403) {
        set({ error: message });
        throw error;
      }
      console.error("Failed to run binding:", message);
      set({ error: message });
      throw error;
    }
  },

  loadAudit: async (alertId) => {
    try {
      const res = await api.get<PlaybookRunAudit[]>(`/alerts/${alertId}/bindings/audit`);
      const audits = (res.data ?? []).map(normalizeAudit);
      set({
        auditByAlertId: { ...get().auditByAlertId, [alertId]: audits },
        previewByAlertId: get().previewByAlertId,
        error: undefined,
      });
      return audits;
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.message || "Failed to load audit";
      if (status === 401 || status === 403) {
        return [];
      }
      console.error("Failed to load bindings audit:", message);
      set({ error: message });
      return [];
    }
  },
}));
