import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/services/api';
import type { Playbook, PlaybookVersion } from '@/modules/playbooks/types';
import { showToast } from '@/components/Toast';

import * as auth from '@/services/auth';

// Enrichment service base URL (different from gateway)
// Note: Routes are at /playbooks (not /enrich/playbooks) since routes_playbooks.py has its own prefix
const ENRICHMENT_BASE_URL = import.meta.env.VITE_ENRICHMENT_URL || 'http://localhost:8091';

// Helper to call enrichment API
async function enrichmentApi<T = any>(method: string, path: string, body?: any): Promise<{ data: T }> {
  const token = auth.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${ENRICHMENT_BASE_URL}${path}`;
  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
  }

  const data = await res.json();
  return { data };
}

// Helper to transform frontend format to backend format
function transformToBackendFormat(frontendJsonBody: any): any {
  const backendSteps = frontendJsonBody.steps.map((step: any) => {
    // Determine kind based on type
    let kind: string;
    if (['geoip', 'whois', 'virustotal', 'reverse_geocode', 'keyword_match', 'http_get', 'http_post'].includes(step.type)) {
      kind = 'enrich';
    } else if (step.type === 'output') {
      kind = 'attach_note';
    } else {
      kind = step.type || step.kind || 'enrich'; // fallback
    }
    
    const backendStep: any = {
      kind,
      actionId: ['geoip', 'whois', 'virustotal', 'reverse_geocode', 'keyword_match', 'http_get', 'http_post'].includes(step.type)
        ? step.type
        : undefined,
      stepId: step.id || step.stepId,
      onError: step.onFail === 'stop' ? 'fail' : (step.onFail === 'continue' ? 'continue' : (step.onError || 'continue')),
      config: step.params || step.config || {},
      next: step.next || [],
      name: step.name,
    };
    
    // For attach_note steps, ensure text field is always present
    if (kind === 'attach_note') {
      // Try to get text from various sources, with a sensible default
      backendStep.text = step.params?.text || step.text || step.name || 'Enrichment summary attached by playbook';
    }
    
    return backendStep;
  });
  
  return {
    steps: backendSteps,
    version: frontendJsonBody.version || '1.0.0',
    entry: frontendJsonBody.entry,
  };
}

type State = {
  items: Playbook[];
  current?: Playbook;
  versions: PlaybookVersion[];

  // canvas transient state
  selection: string[];               // selected node ids
  isDirty: boolean;

  // actions
  load: (status?: 'draft'|'published') => Promise<void>;
  open: (id: string) => Promise<void>;
  createDraft: (p: Partial<Playbook>) => Promise<Playbook>;
  update: (id: string, patch: Partial<Playbook> & { releaseNotes?: string }) => Promise<void>;
  del: (id: string) => Promise<void>;

  validate: (jsonBody: Playbook['jsonBody']) => Promise<{ isValid: boolean; warnings?: string[]; errors?: string[] }>;
  testRun: (jsonBody: Playbook['jsonBody']) => Promise<{ logs: any[]; success: boolean }>;

  listVersions: (id: string) => Promise<void>;
  rollback: (id: string, version: number) => Promise<void>;

  aiGenerate: (prompt: string) => Promise<Playbook['jsonBody']>;
  aiExplain: (step: any) => Promise<string>;

  setCurrentJson: (mutator: (j: Playbook['jsonBody']) => Playbook['jsonBody']) => void;
  setSelection: (ids: string[]) => void;
  markDirty: (v: boolean) => void;
};

const usePlaybooksStore = create<State>()(persist((set, get) => ({
  items: [],
  versions: [],
  selection: [],
  isDirty: false,

  load: async (status) => {
    try {
      const params = status ? { status } : {};
      const queryString = status ? `?status=${status}` : '';
      const res = await enrichmentApi<Playbook[]>('GET', `/playbooks${queryString}`);
      set({ items: res.data });
    } catch (error: any) {
      showToast(`Failed to load playbooks: ${error.message}`);
      console.error('Failed to load playbooks:', error);
    }
  },

  open: async (id) => {
    try {
      const res = await enrichmentApi<Playbook>('GET', `/playbooks/${id}`);
      
      // Transform backend response to match our types
      // Backend may return steps in jsonBody.steps or directly in steps
      const backendData = res.data;
      const steps = backendData.jsonBody?.steps || backendData.steps || [];
      
      // Transform backend step format to frontend format
      // Backend uses: { kind, actionId, stepId, onError, text, ... }
      // Frontend uses: { id, type, name, params, onFail, next, ... }
      const transformedSteps = steps.map((step: any) => {
        const frontendStep: any = {
          id: step.stepId || step.id || `step-${Date.now()}-${Math.random()}`,
          type: step.actionId || step.kind || step.type,
          name: step.name || step.stepId,
          params: step.config || step.params || {},
          onFail: step.onError === 'fail' ? 'stop' : 'continue',
          next: step.next || [],
        };
        
        // For attach_note steps (output type), preserve text field in params
        if (step.kind === 'attach_note' && step.text) {
          frontendStep.params = { ...frontendStep.params, text: step.text };
        }
        
        return frontendStep;
      });
      
      const playbook: Playbook = {
        ...backendData,
        jsonBody: {
          steps: transformedSteps,
          version: backendData.jsonBody?.version || backendData.version || '1.0.0',
          entry: backendData.jsonBody?.entry || transformedSteps[0]?.id,
        },
      };
      
      set({ current: playbook, isDirty: false });
      
      // Load versions
      const vr = await enrichmentApi<PlaybookVersion[]>('GET', `/playbooks/${id}/versions`);
      set({ versions: vr.data });
    } catch (error: any) {
      showToast(`Failed to open playbook: ${error.message}`);
      console.error('Failed to open playbook:', error);
    }
  },

  createDraft: async (p) => {
    try {
      // Transform frontend format to backend format
      const frontendJsonBody = p.jsonBody || { steps: [], version: '1.0.0' };
      const backendJsonBody = transformToBackendFormat(frontendJsonBody);
      
      const playbookData = {
        name: p.name || 'Untitled Playbook',
        description: p.description,
        jsonBody: backendJsonBody,
        status: 'draft' as const,
      };
      
      const res = await enrichmentApi<Playbook>('POST', '/playbooks', playbookData);
      await get().load('draft');
      showToast('Draft created');
      return res.data;
    } catch (error: any) {
      showToast(`Failed to create draft: ${error.message}`);
      throw error;
    }
  },

  update: async (id, patch) => {
    try {
      const updateData: any = {};
      if (patch.name !== undefined) updateData.name = patch.name;
      if (patch.description !== undefined) updateData.description = patch.description;
      if (patch.status !== undefined) updateData.status = patch.status;
      if ((patch as any).releaseNotes !== undefined) updateData.releaseNotes = (patch as any).releaseNotes;
      
      // Transform frontend format to backend format if jsonBody is provided
      if (patch.jsonBody !== undefined) {
        updateData.jsonBody = transformToBackendFormat(patch.jsonBody);
      }

      const res = await enrichmentApi<Playbook>('PUT', `/playbooks/${id}`, updateData);
      
      // Transform response back to frontend format
      const backendData = res.data;
      const steps = backendData.jsonBody?.steps || backendData.steps || [];
      const transformedSteps = steps.map((step: any) => ({
        id: step.stepId || step.id || `step-${Date.now()}-${Math.random()}`,
        type: step.actionId || step.kind || step.type,
        name: step.name || step.stepId,
        params: step.config || step.params || {},
        onFail: step.onError === 'fail' ? 'stop' : 'continue',
        next: step.next || [],
      }));
      
      const transformedPlaybook: Playbook = {
        ...backendData,
        jsonBody: {
          steps: transformedSteps,
          version: backendData.jsonBody?.version || backendData.version || '1.0.0',
          entry: backendData.jsonBody?.entry || transformedSteps[0]?.id,
        },
      };
      
      set({ current: transformedPlaybook, isDirty: false });
      showToast('Playbook updated');
    } catch (error: any) {
      showToast(`Failed to update playbook: ${error.message}`);
      throw error;
    }
  },

  del: async (id) => {
    try {
      await enrichmentApi('DELETE', `/playbooks/${id}`);
      set({ current: undefined });
      await get().load();
      showToast('Playbook deleted');
    } catch (error: any) {
      showToast(`Failed to delete playbook: ${error.message}`);
      throw error;
    }
  },

  validate: async (jsonBody) => {
    try {
      // Transform frontend format to backend format before validation
      const backendJsonBody = transformToBackendFormat(jsonBody);
      
      const res = await enrichmentApi<{ isValid: boolean; warnings?: string[]; error?: string }>(
        'POST',
        '/playbooks/validate',
        { jsonBody: backendJsonBody }
      );
      return {
        isValid: res.data.isValid,
        warnings: res.data.warnings || [],
        errors: res.data.error ? [res.data.error] : [],
      };
    } catch (error: any) {
      return {
        isValid: false,
        errors: [error.message],
      };
    }
  },

  testRun: async (jsonBody) => {
    try {
      // Transform frontend format to backend format before test run
      const backendJsonBody = transformToBackendFormat(jsonBody);
      
      const res = await enrichmentApi<{ status: string; steps: any[] }>(
        'POST',
        '/playbooks/test-run',
        { jsonBody: backendJsonBody }
      );
      return {
        logs: res.data.steps || [],
        success: res.data.status === 'success',
      };
    } catch (error: any) {
      return {
        logs: [],
        success: false,
      };
    }
  },

  listVersions: async (id) => {
    try {
      const res = await enrichmentApi<PlaybookVersion[]>('GET', `/playbooks/${id}/versions`);
      set({ versions: res.data });
    } catch (error: any) {
      console.error('Failed to list versions:', error);
    }
  },

  rollback: async (id, version) => {
    try {
      const res = await enrichmentApi<Playbook>('POST', `/playbooks/${id}/rollback/${version}`);
      set({ current: res.data, isDirty: false });
      await get().listVersions(id);
      showToast(`Rolled back to version ${version}`);
    } catch (error: any) {
      showToast(`Failed to rollback: ${error.message}`);
      throw error;
    }
  },

  aiGenerate: async (prompt) => {
    try {
      const res = await enrichmentApi<{ playbook: Playbook['jsonBody'] }>(
        'POST',
        '/playbooks/ai/generate',
        { prompt }
      );
      return res.data.playbook;
    } catch (error: any) {
      showToast(`AI generation failed: ${error.message}`);
      throw error;
    }
  },

  aiExplain: async (step) => {
    try {
      const res = await enrichmentApi<{ explanation: string }>(
        'POST',
        '/playbooks/ai/explain',
        { step }
      );
      return res.data.explanation;
    } catch (error: any) {
      throw new Error(`AI explanation failed: ${error.message}`);
    }
  },

  setCurrentJson: (mutator) => {
    const cur = get().current;
    if (!cur) return;
    const next = { ...cur, jsonBody: mutator(cur.jsonBody) };
    set({ current: next, isDirty: true });
  },

  setSelection: (ids) => set({ selection: ids }),

  markDirty: (v) => set({ isDirty: v }),

}), { name: 'playbooks' }));

export default usePlaybooksStore;

