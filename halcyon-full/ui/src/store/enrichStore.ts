import { create } from "zustand";
import { getToken } from "@/services/auth";

type SubjectKind = "alert" | "case";

type Action = {
  id: string;
  name: string;
  kind: string;
  config: Record<string, any>;
  enabled: boolean;
};

type Playbook = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
};

type Run = {
  id: string;
  subjectKind: SubjectKind;
  subjectId: string;
  kind: "action" | "playbook";
  ref: { actionId?: string; playbookId?: string };
  status: "pending" | "running" | "success" | "failed";
  startedAt: string;
  finishedAt?: string | null;
  output?: Record<string, any> | null;
  error?: string | null;
  metrics?: Record<string, any>;
  userId?: string | null;
  steps?: Array<{
    stepId: string;
    kind: string;
    status: string;
    output?: any;
    error?: string;
    durationMs: number;
  }>;
};

type State = {
  actions: Action[];
  playbooks: Playbook[];
  runs: Record<string, Run[]>; // key: "alert:123" or "case:456"
  loading: boolean;
  error: string | null;
  
  // Actions
  listActions: () => Promise<void>;
  listPlaybooks: () => Promise<void>;
  runAction: (subjectKind: SubjectKind, subjectId: string, actionId: string, attachAsNote?: boolean) => Promise<Run>;
  runPlaybook: (subjectKind: SubjectKind, subjectId: string, playbookId: string, attachAsNote?: boolean) => Promise<Run>;
  listRuns: (subjectKind: SubjectKind, subjectId: string) => Promise<void>;
};

const getRunsKey = (subjectKind: SubjectKind, subjectId: string) => `${subjectKind}:${subjectId}`;

export const useEnrichStore = create<State>((set, get) => ({
  actions: [],
  playbooks: [],
  runs: {},
  loading: false,
  error: null,

  listActions: async () => {
    try {
      const enrichUrl = import.meta.env.VITE_ENRICHMENT_URL || "http://localhost:8091";
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const res = await fetch(`${enrichUrl}/enrich/actions`, { headers });
      if (!res.ok) {
        if (res.status === 404) {
          set({ actions: [] });
          return;
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      set({ actions: data || [] });
    } catch (error: any) {
      const msg = error?.message || "";
      if (msg.includes("404") || msg.includes("Not Found")) {
        set({ actions: [] });
        return;
      }
      console.error("Failed to load actions:", msg);
      set({ error: msg, actions: [] });
    }
  },

  listPlaybooks: async () => {
    try {
      const enrichUrl = import.meta.env.VITE_ENRICHMENT_URL || "http://localhost:8091";
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const res = await fetch(`${enrichUrl}/enrich/playbooks`, { headers });
      if (!res.ok) {
        if (res.status === 404) {
          set({ playbooks: [] });
          return;
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      set({ playbooks: data || [] });
    } catch (error: any) {
      const msg = error?.message || "";
      if (msg.includes("404") || msg.includes("Not Found")) {
        set({ playbooks: [] });
        return;
      }
      console.error("Failed to load playbooks:", msg);
      set({ error: msg, playbooks: [] });
    }
  },

  runAction: async (subjectKind, subjectId, actionId, attachAsNote = false) => {
    try {
      const enrichUrl = import.meta.env.VITE_ENRICHMENT_URL || "http://localhost:8091";
      const token = (await import("@/services/auth")).getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const res = await fetch(`${enrichUrl}/enrich/run`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          subjectKind,
          subjectId,
          actionId,
          attachAsNote,
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(`HTTP ${res.status}: ${errorData.detail || res.statusText}`);
      }
      
      const run = await res.json();
      const key = getRunsKey(subjectKind, subjectId);
      const currentRuns = get().runs[key] || [];
      set({
        runs: {
          ...get().runs,
          [key]: [run, ...currentRuns],
        },
      });
      
      // Persist last-used action
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("halcyon:lastEnrichAction", actionId);
      }
      
      return run;
    } catch (error: any) {
      const msg = error?.message || "Failed to run action";
      set({ error: msg });
      throw error;
    }
  },

  runPlaybook: async (subjectKind, subjectId, playbookId, attachAsNote = false) => {
    try {
      const enrichUrl = import.meta.env.VITE_ENRICHMENT_URL || "http://localhost:8091";
      const token = (await import("@/services/auth")).getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const res = await fetch(`${enrichUrl}/enrich/playbooks/run`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          subjectKind,
          subjectId,
          playbookId,
          attachAsNote,
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(`HTTP ${res.status}: ${errorData.detail || res.statusText}`);
      }
      
      const run = await res.json();
      const key = getRunsKey(subjectKind, subjectId);
      const currentRuns = get().runs[key] || [];
      set({
        runs: {
          ...get().runs,
          [key]: [run, ...currentRuns],
        },
      });
      
      // Persist last-used playbook
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("halcyon:lastEnrichPlaybook", playbookId);
      }
      
      return run;
    } catch (error: any) {
      const msg = error?.message || "Failed to run playbook";
      set({ error: msg });
      throw error;
    }
  },

  listRuns: async (subjectKind, subjectId) => {
    try {
      const enrichUrl = import.meta.env.VITE_ENRICHMENT_URL || "http://localhost:8091";
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const url = `${enrichUrl}/enrich/runs?subjectKind=${subjectKind}&subjectId=${subjectId}`;
      const res = await fetch(url, { headers });
      
      if (!res.ok) {
        if (res.status === 404) {
          const key = getRunsKey(subjectKind, subjectId);
          set({
            runs: {
              ...get().runs,
              [key]: [],
            },
          });
          return;
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      const key = getRunsKey(subjectKind, subjectId);
      set({
        runs: {
          ...get().runs,
          [key]: data || [],
        },
      });
    } catch (error: any) {
      const msg = error?.message || "";
      if (msg.includes("404") || msg.includes("Not Found")) {
        const key = getRunsKey(subjectKind, subjectId);
        set({
          runs: {
            ...get().runs,
            [key]: [],
          },
        });
        return;
      }
      console.error("Failed to load runs:", msg);
      set({ error: msg });
    }
  },
}));

