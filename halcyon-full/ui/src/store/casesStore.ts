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
  setSelected: (c?: Case | null) => void;
};

export const useCasesStore = create<CasesState>((set, get) => ({
  loading: false,
  items: [],
  selected: null,

  setSelected: (c) => set({ selected: c }),

  list: async (q = {}) => {
    set({ loading: true });
    try {
      const res = await api.get<Case[]>("/cases", { params: q });
      set({ items: res.data ?? [] });
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('401') || msg.includes('403') || msg.includes('404') || msg.includes('Unauthorized') || msg.includes('Not Found')) {
        set({ items: [] }); // silent expected errors
        return;
      }
      throw e; // let AlertDialog handle 5xx/network
    } finally { 
      set({ loading: false }); 
    }
  },

  get: async (id) => {
    try {
      const res = await api.get<Case>(`/cases/${id}`);
      return res.data;
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('401') || msg.includes('403') || msg.includes('404') || msg.includes('Unauthorized') || msg.includes('Not Found')) {
        throw new Error('Case not found');
      }
      throw e;
    }
  },

  create: async (payload) => {
    const res = await api.post<Case>("/cases", payload);
    // Refresh list after create
    await get().list();
    return res.data;
  },

  update: async (id, payload) => {
    try {
      const res = await api.patch<Case>(`/cases/${id}`, payload);
      // Update in list if present
      set(state => ({
        items: state.items.map(c => c.id === id ? res.data : c),
        selected: state.selected?.id === id ? res.data : state.selected
      }));
      return res.data;
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
}));
