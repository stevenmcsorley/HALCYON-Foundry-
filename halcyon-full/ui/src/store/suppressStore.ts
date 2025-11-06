import { create } from 'zustand';
import { api } from '@/services/api';

export interface Silence {
  id: number;
  name: string;
  match_json: Record<string, any>;
  starts_at: string;
  ends_at: string;
  reason?: string;
  created_by?: string;
  created_at: string;
}

export interface Maintenance {
  id: number;
  name: string;
  match_json: Record<string, any>;
  starts_at: string;
  ends_at: string;
  reason?: string;
  created_by?: string;
  created_at: string;
}

interface SuppressStore {
  silences: Silence[];
  maintenance: Maintenance[];
  loading: boolean;
  error: string | null;
  
  loadSilences: (includeExpired?: boolean) => Promise<void>;
  createSilence: (silence: Omit<Silence, 'id' | 'created_at' | 'created_by'>) => Promise<number>;
  deleteSilence: (id: number) => Promise<void>;
  
  loadMaintenance: (includeExpired?: boolean) => Promise<void>;
  createMaintenance: (maintenance: Omit<Maintenance, 'id' | 'created_at' | 'created_by'>) => Promise<number>;
  deleteMaintenance: (id: number) => Promise<void>;
  
  reset: () => void;
}

export const useSuppressStore = create<SuppressStore>((set, get) => ({
  silences: [],
  maintenance: [],
  loading: false,
  error: null,

  loadSilences: async (includeExpired = false) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/silences?include_expired=${includeExpired}`);
      set({ silences: response.data, loading: false });
    } catch (err: any) {
      const msg = err?.message || '';
      // Only silently handle 404 - 401/403 should show errors
      if (msg.includes('404') || msg.includes('Not Found')) {
        set({ silences: [], loading: false, error: null });
      } else if (msg.includes('401') || msg.includes('Unauthorized')) {
        // Try refresh token
        try {
          const { refresh } = await import('@/services/auth');
          await refresh();
          const retry = await api.get(`/silences?include_expired=${includeExpired}`);
          set({ silences: retry.data, loading: false });
        } catch {
          set({ error: 'Unauthorized - please log in again', loading: false });
        }
      } else {
        set({ error: err?.message || 'Failed to load silences', loading: false });
      }
    }
  },

  createSilence: async (silence) => {
    set({ error: null });
    try {
      const response = await api.post('/silences', silence);
      await get().loadSilences();
      return response.data.id;
    } catch (err: any) {
      set({ error: err?.message || 'Failed to create silence' });
      throw err;
    }
  },

  deleteSilence: async (id) => {
    set({ error: null });
    try {
      await api.delete(`/silences/${id}`);
      await get().loadSilences();
    } catch (err: any) {
      // Silent 404 (already deleted)
      if (err?.status === 404) {
        await get().loadSilences();
      } else {
        set({ error: err?.message || 'Failed to delete silence' });
        throw err;
      }
    }
  },

  loadMaintenance: async (includeExpired = false) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/maintenance?include_expired=${includeExpired}`);
      set({ maintenance: response.data, loading: false });
    } catch (err: any) {
      const msg = err?.message || '';
      // Only silently handle 404 - 401/403 should show errors
      if (msg.includes('404') || msg.includes('Not Found')) {
        set({ maintenance: [], loading: false, error: null });
      } else if (msg.includes('401') || msg.includes('Unauthorized')) {
        // Try refresh token
        try {
          const { refresh } = await import('@/services/auth');
          await refresh();
          const retry = await api.get(`/maintenance?include_expired=${includeExpired}`);
          set({ maintenance: retry.data, loading: false });
        } catch {
          set({ error: 'Unauthorized - please log in again', loading: false });
        }
      } else {
        set({ error: err?.message || 'Failed to load maintenance windows', loading: false });
      }
    }
  },

  createMaintenance: async (maintenance) => {
    set({ error: null });
    try {
      const response = await api.post('/maintenance', maintenance);
      await get().loadMaintenance();
      return response.data.id;
    } catch (err: any) {
      set({ error: err?.message || 'Failed to create maintenance window' });
      throw err;
    }
  },

  deleteMaintenance: async (id) => {
    set({ error: null });
    try {
      await api.delete(`/maintenance/${id}`);
      await get().loadMaintenance();
    } catch (err: any) {
      // Silent 404 (already deleted)
      if (err?.status === 404) {
        await get().loadMaintenance();
      } else {
        set({ error: err?.message || 'Failed to delete maintenance window' });
        throw err;
      }
    }
  },

  reset: () => {
    set({ silences: [], maintenance: [], loading: false, error: null });
  },
}));
