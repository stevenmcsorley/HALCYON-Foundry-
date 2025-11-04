import { create } from "zustand";
import { api } from "@/services/api";
import { subscribe } from "@/services/websocket";

type Alert = {
  id: number;
  ruleId: number;
  entityId?: string;
  message: string;
  severity: "low" | "medium" | "high";
  status: "new" | "ack" | "resolved";
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  acknowledgedBy?: string;
  resolvedBy?: string;
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
      // Silently handle 401/403 errors - user might not be authenticated yet
      if (error?.message?.includes('Unauthorized') || error?.message?.includes('403')) {
        set({ alerts: [] });
        return;
      }
      // Re-throw other errors
      throw error;
    }
  },
  setFilters: (f) => set({ filters: { ...get().filters, ...f } }),
  ack: async (id) => {
    try {
      await api.post(`/alerts/${id}/ack`);
      await get().load();
    } catch (error: any) {
      // Silently handle auth errors
      if (error?.message?.includes('Unauthorized') || error?.message?.includes('403')) {
        return;
      }
      throw error;
    }
  },
  resolve: async (id) => {
    try {
      await api.post(`/alerts/${id}/resolve`);
      await get().load();
    } catch (error: any) {
      // Silently handle auth errors
      if (error?.message?.includes('Unauthorized') || error?.message?.includes('403')) {
        return;
      }
      throw error;
    }
  },
}));

// Wire WebSocket stream
subscribe((m: any) => {
  if (m?.t === "alert.created") {
    useAlertsStore.setState((s) => ({
      alerts: [m.data, ...s.alerts],
      unread: s.unread + 1,
    }));
  } else if (m?.t === "alert.updated") {
    useAlertsStore.setState((s) => ({
      alerts: s.alerts.map((a) => (a.id === m.data.id ? { ...a, ...m.data } : a)),
    }));
  }
});
