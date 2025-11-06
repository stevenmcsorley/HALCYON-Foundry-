import { create } from "zustand";
import { api } from "@/services/api";

export interface ActionAttempt {
  id: number;
  alertId: number;
  dest: string;
  status: string;
  httpStatus?: number | null;
  error?: string | null;
  attempt: number;
  scheduledAt?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

export interface RouteDecision {
  dest: string;
  wouldSend: boolean;
  reason: string;
  suppressed: boolean;
}

type ActionsState = {
  loadLogs: (alertId: number) => Promise<ActionAttempt[]>;
  previewRoutes: (alertId: number) => Promise<RouteDecision[]>;
  retry: (alertId: number, dest: string) => Promise<ActionAttempt>;
  retryAllFailed: (alertId: number) => Promise<ActionAttempt[]>;
};

export const useActionsStore = create<ActionsState>(() => ({
  loadLogs: async (alertId: number) => {
    try {
      const res = await api.get<ActionAttempt[]>(`/alerts/${alertId}/actions/logs`);
      return res.data || [];
    } catch (error: any) {
      const status = error?.response?.status;
      const errorMsg = error?.message || "";
      
      // Silent handling for expected errors (same policy as alertsStore)
      if (
        status === 401 ||
        status === 403 ||
        status === 404 ||
        errorMsg.includes("Unauthorized") ||
        errorMsg.includes("Forbidden") ||
        errorMsg.includes("Not Found")
      ) {
        return []; // Return empty array on expected errors
      }
      
      // Log error - UI components can show AlertDialog if needed
      console.error("Failed to load action logs:", errorMsg);
      return [];
    }
  },

  previewRoutes: async (alertId: number) => {
    try {
      const res = await api.post<RouteDecision[]>(`/alerts/${alertId}/actions/preview`);
      return res.data || [];
    } catch (error: any) {
      const status = error?.response?.status;
      const errorMsg = error?.message || "";
      
      // Silent handling for expected errors
      if (
        status === 401 ||
        status === 403 ||
        status === 404 ||
        errorMsg.includes("Unauthorized") ||
        errorMsg.includes("Forbidden") ||
        errorMsg.includes("Not Found")
      ) {
        return []; // Return empty array on expected errors
      }
      
      // Log error - UI components can show AlertDialog if needed
      console.error("Failed to preview routes:", errorMsg);
      return [];
    }
  },

  retry: async (alertId: number, dest: string) => {
    try {
      const res = await api.post<ActionAttempt>(`/alerts/${alertId}/actions/retry`, { dest });
      return res.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const errorMsg = error?.message || "";
      
      // Silent handling for expected errors
      if (
        status === 401 ||
        status === 403 ||
        status === 404 ||
        errorMsg.includes("Unauthorized") ||
        errorMsg.includes("Forbidden") ||
        errorMsg.includes("Not Found")
      ) {
        throw error; // Re-throw for caller to handle
      }
      
      // Log error - UI components can show AlertDialog if needed
      console.error("Failed to retry action:", errorMsg);
      throw error;
    }
  },

  retryAllFailed: async (alertId: number) => {
    try {
      const res = await api.post<ActionAttempt[]>(`/alerts/${alertId}/actions/retry-all-failed`);
      return res.data || [];
    } catch (error: any) {
      const status = error?.response?.status;
      const errorMsg = error?.message || "";
      
      // Silent handling for expected errors
      if (
        status === 401 ||
        status === 403 ||
        status === 404 ||
        errorMsg.includes("Unauthorized") ||
        errorMsg.includes("Forbidden") ||
        errorMsg.includes("Not Found")
      ) {
        throw error; // Re-throw for caller to handle
      }
      
      // Log error - UI components can show AlertDialog if needed
      console.error("Failed to retry all failed actions:", errorMsg);
      throw error;
    }
  },
}));

