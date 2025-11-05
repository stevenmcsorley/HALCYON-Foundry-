import { create } from "zustand";
import { api } from "@/services/api";
import { subscribe } from "@/services/websocket";

type Alert = {
  id: number;
  ruleId: number;
  entityId?: string;
  message: string;
  severity: "low" | "medium" | "high";
  status: "open" | "ack" | "resolved";
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  acknowledgedBy?: string;
  resolvedBy?: string;
  count?: number;
  firstSeen?: string;
  lastSeen?: string;
  fingerprint?: string;
  groupKey?: string;
  caseId?: number | null;
  suppressedBy?: {
    kind: 'silence' | 'maintenance';
    id: number;
    name: string;
  };
  suppressedByKind?: 'silence' | 'maintenance';
  suppressedById?: number;
  suppressedByName?: string;
};

type Filters = { status?: string; severity?: string };

type State = {
  alerts: Alert[];
  unread: number;
  filters: Filters;
  load: () => Promise<void>;
  setFilters: (f: Partial<Filters>) => void;
  ack: (id: number) => Promise<void>;
  resolve: (id: number) => Promise<void>;
};

export const useAlertsStore = create<State>((set, get) => ({
  alerts: [],
  unread: 0,
  filters: {},
  load: async () => {
    try {
      const { status, severity } = get().filters;
      const res = await api.get("/alerts", { params: { status, severity } });
      set({ alerts: res.data });
    } catch (error: any) {
      // Silently handle expected errors - backend might not be configured or user not authenticated
      const errorMsg = error?.message || '';
      if (
        errorMsg.includes('Unauthorized') || 
        errorMsg.includes('403') || 
        errorMsg.includes('404') ||
        errorMsg.includes('Not Found')
      ) {
        set({ alerts: [] });
        return;
      }
      // Re-throw unexpected errors (5xx, network errors, etc.)
      throw error;
    }
  },
  setFilters: (f) => set({ filters: { ...get().filters, ...f } }),
  ack: async (id) => {
    try {
      await api.post(`/alerts/${id}/ack`);
      await get().load();
    } catch (error: any) {
      // Silently handle expected errors (auth, not found)
      const errorMsg = error?.message || '';
      if (
        errorMsg.includes('Unauthorized') || 
        errorMsg.includes('403') || 
        errorMsg.includes('404') ||
        errorMsg.includes('Not Found')
      ) {
        return;
      }
      // Re-throw unexpected errors (5xx, network errors)
      throw error;
    }
  },
  resolve: async (id) => {
    try {
      await api.post(`/alerts/${id}/resolve`);
      await get().load();
    } catch (error: any) {
      // Silently handle expected errors (auth, not found)
      const errorMsg = error?.message || '';
      if (
        errorMsg.includes('Unauthorized') || 
        errorMsg.includes('403') || 
        errorMsg.includes('404') ||
        errorMsg.includes('Not Found')
      ) {
        return;
      }
      // Re-throw unexpected errors (5xx, network errors)
      throw error;
    }
  },
}));

// Wire WebSocket stream
subscribe((m: any) => {
  if (m?.t === "alert.created") {
          // Map suppressedBy fields if present
      const alertData = m.data;
      if (alertData.suppressedByKind) {
        alertData.suppressedBy = {
          kind: alertData.suppressedByKind,
          id: alertData.suppressedById || 0,
          name: alertData.suppressedByName || '',
        };
      }
      useAlertsStore.setState((s) => ({
        alerts: [alertData, ...s.alerts],
        unread: s.unread + (m.data.status === "open" ? 1 : 0),
      }));
    } else if (m?.t === "alert.updated") {
      // Map suppressedBy fields if present
      const alertData = m.data;
      if (alertData.suppressedByKind) {
        alertData.suppressedBy = {
          kind: alertData.suppressedByKind,
          id: alertData.suppressedById || 0,
          name: alertData.suppressedByName || '',
        };
      }
      useAlertsStore.setState((s) => ({
        alerts: s.alerts.map((a) => (a.id === m.data.id ? { ...a, ...alertData } : a)),
        // Don't increment unread on dedupe updates
      }));
  }
});
