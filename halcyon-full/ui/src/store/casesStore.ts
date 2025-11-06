import { create } from "zustand";
import { api } from "@/services/api";

export type CaseStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type CasePriority = 'low' | 'medium' | 'high' | 'critical';

export interface Case {
  id: number;
  title: string;
  description?: string | null;
  status: CaseStatus;
  priority: CasePriority;
  owner?: string | null;
  createdBy?: string | null;
  createdAt: string;   // ISO
  updatedAt: string;   // ISO
  resolvedAt?: string | null;
  prioritySuggestion?: string | null;
  ownerSuggestion?: string | null;
  similarCaseIds?: number[] | null;
  mlVersion?: string | null;
}

export interface CaseNote {
  id: number;
  caseId: number;
  author?: string | null;
  body: string;
  createdAt: string; // ISO
}

type CasesState = {
  loading: boolean;
  items: Case[];
  selected?: Case | null;
  list: (q?: { 
    status?: CaseStatus; 
    owner?: string; 
    priority?: CasePriority; 
    search?: string; 
    limit?: number; 
    offset?: number; 
  }) => Promise<void>;
  get: (id: number) => Promise<Case>;
  create: (payload: Partial<Case>) => Promise<Case>;
  update: (id: number, payload: Partial<Case>) => Promise<Case>;
  listNotes: (caseId: number) => Promise<CaseNote[]>;
  addNote: (caseId: number, body: string) => Promise<CaseNote>;
  assignAlerts: (caseId: number, alertIds: number[]) => Promise<void>;
  adoptPriority: (id: number) => Promise<Case>;
  adoptOwner: (id: number) => Promise<Case>;
  setSelected: (c?: Case | null) => void;
};

// Helper to transform snake_case API response to camelCase
const transformCase = (data: any): Case => {
  return {
    ...data,
    createdBy: data.createdBy || data.created_by,
    createdAt: data.createdAt || data.created_at,
    updatedAt: data.updatedAt || data.updated_at,
    resolvedAt: data.resolvedAt || data.resolved_at,
    prioritySuggestion: data.prioritySuggestion || data.priority_suggestion,
    ownerSuggestion: data.ownerSuggestion || data.owner_suggestion,
    similarCaseIds: data.similarCaseIds || data.similar_case_ids,
    mlVersion: data.mlVersion || data.ml_version,
  };
};

export const useCasesStore = create<CasesState>((set, get) => ({
  loading: false,
  items: [],
  selected: null,

  setSelected: (c) => set({ selected: c }),

  list: async (q = {}) => {
    set({ loading: true });
    try {
      const res = await api.get<any[]>("/cases", { params: q });
      const transformed = (res.data ?? []).map(transformCase);
      set({ items: transformed });
    } catch (e: any) {
      const msg = e?.message || '';
      // Only silently handle 404 (not found) - 401/403 should be shown as errors
      if (msg.includes('404') || msg.includes('Not Found')) {
        set({ items: [] }); // silent for 404 (no cases yet)
        return;
      }
      // For 401/403, try to refresh token first, then throw if still failing
      if (msg.includes('401') || msg.includes('Unauthorized')) {
        try {
          const { refresh } = await import('@/services/auth');
          await refresh();
          // Retry once after refresh
          const retry = await api.get<any[]>("/cases", { params: q });
          const transformed = (retry.data ?? []).map(transformCase);
          set({ items: transformed });
          return;
        } catch {
          // Refresh failed, will redirect to login
          throw e;
        }
      }
      // 403 and other errors should be thrown to show AlertDialog
      throw e;
    } finally { 
      set({ loading: false }); 
    }
  },

  get: async (id) => {
    try {
      const res = await api.get<any>(`/cases/${id}`);
      return transformCase(res.data);
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('401') || msg.includes('403') || msg.includes('404') || msg.includes('Unauthorized') || msg.includes('Not Found')) {
        throw new Error('Case not found');
      }
      throw e;
    }
  },

  create: async (payload) => {
    // Normalize enum values to lowercase to match backend validation
    const normalized = {
      ...payload,
      priority: payload.priority?.toLowerCase(),
      status: payload.status?.toLowerCase(),
    };
    const res = await api.post<any>("/cases", normalized);
    const transformed = transformCase(res.data);
    // Refresh list after create
    await get().list();
    return transformed;
  },

  update: async (id, payload) => {
    try {
      // Normalize enum values to lowercase to match backend validation
      const normalized = {
        ...payload,
        priority: payload.priority?.toLowerCase(),
        status: payload.status?.toLowerCase(),
      };
      const res = await api.patch<any>(`/cases/${id}`, normalized);
      const transformed = transformCase(res.data);
      // Update in list if present
      set(state => ({
        items: state.items.map(c => c.id === id ? transformed : c),
        selected: state.selected?.id === id ? transformed : state.selected
      }));
      return transformed;
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('401') || msg.includes('403') || msg.includes('404') || msg.includes('Unauthorized') || msg.includes('Not Found')) {
        throw new Error('Failed to update case');
      }
      throw e;
    }
  },

  listNotes: async (caseId) => {
    try {
      const res = await api.get<CaseNote[]>(`/cases/${caseId}/notes`);
      return res.data ?? [];
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('401') || msg.includes('403') || msg.includes('404') || msg.includes('Unauthorized') || msg.includes('Not Found')) {
        return [];
      }
      throw e;
    }
  },

  addNote: async (caseId, body) => {
    const res = await api.post<CaseNote>(`/cases/${caseId}/notes`, { body });
    return res.data;
  },

  assignAlerts: async (caseId, alertIds) => {
    try {
      await api.post(`/cases/${caseId}/alerts:assign`, { alertIds });
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('401') || msg.includes('403') || msg.includes('404') || msg.includes('Unauthorized') || msg.includes('Not Found')) {
        throw new Error('Failed to assign alerts');
      }
      throw e;
    }
  },

  adoptPriority: async (id) => {
    try {
      const res = await api.patch<any>(`/cases/${id}/adopt/priority`);
      const transformed = transformCase(res.data);
      // Update in list and selected
      set(state => ({
        items: state.items.map(c => c.id === id ? transformed : c),
        selected: state.selected?.id === id ? transformed : state.selected
      }));
      return transformed;
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('401') || msg.includes('403') || msg.includes('404') || msg.includes('Unauthorized') || msg.includes('Not Found')) {
        throw new Error('Failed to adopt priority suggestion');
      }
      throw e;
    }
  },

  adoptOwner: async (id) => {
    try {
      const res = await api.patch<any>(`/cases/${id}/adopt/owner`);
      const transformed = transformCase(res.data);
      // Update in list and selected
      set(state => ({
        items: state.items.map(c => c.id === id ? transformed : c),
        selected: state.selected?.id === id ? transformed : state.selected
      }));
      return transformed;
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('401') || msg.includes('403') || msg.includes('404') || msg.includes('Unauthorized') || msg.includes('Not Found')) {
        throw new Error('Failed to adopt owner suggestion');
      }
      throw e;
    }
  },
}));


