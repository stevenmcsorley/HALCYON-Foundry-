export type PlaybookStatus = 'draft' | 'published';

export interface PlaybookStep {
  id: string;              // stable id for graph nodes/edges
  type: 'geoip' | 'whois' | 'http_get' | 'http_post' | 'virustotal' | 'reverse_geocode' | 'keyword_match' | 'branch' | 'wait' | 'output';
  name?: string;
  params?: Record<string, unknown>;
  onFail?: 'continue' | 'stop';
  next?: string[];         // target step ids (for branches, multiple)
}

export interface Playbook {
  id: string;
  name: string;
  description?: string;
  status: PlaybookStatus;
  jsonBody: {
    version?: string;       // e.g. "1.0.0"
    steps: PlaybookStep[];
    entry?: string;         // entry step id
  };
  createdBy?: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface PlaybookVersion {
  id?: number;
  playbookId: string;
  version: number;
  createdAt: string;
  jsonBody: Playbook['jsonBody'];
  createdBy?: string;
  releaseNotes?: string;
}

