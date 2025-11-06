import type { Playbook } from './types';

export interface PlaybookTemplate {
  id: string;
  name: string;
  description: string;
  jsonBody: Playbook['jsonBody'];
}

export const PLAYBOOK_TEMPLATES: PlaybookTemplate[] = [
  {
    id: 'ip-enrichment',
    name: 'IP Enrichment',
    description: 'Enrich IP addresses with GeoIP and WHOIS lookup',
    jsonBody: {
      version: '1.0.0',
      entry: 'geoip-1',
      steps: [
        {
          id: 'geoip-1',
          type: 'geoip',
          name: 'GeoIP Lookup',
          next: ['whois-1'],
        },
        {
          id: 'whois-1',
          type: 'whois',
          name: 'WHOIS Lookup',
          next: ['output-1'],
        },
        {
          id: 'output-1',
          type: 'output',
          name: 'Attach Results',
          params: {
            text: 'IP enrichment completed: GeoIP and WHOIS data attached',
          },
          next: [],
        },
      ],
    },
  },
  {
    id: 'full-enrichment',
    name: 'Full Enrichment',
    description: 'Comprehensive enrichment: GeoIP, WHOIS, VirusTotal, and Reverse Geocode',
    jsonBody: {
      version: '1.0.0',
      entry: 'geoip-1',
      steps: [
        {
          id: 'geoip-1',
          type: 'geoip',
          name: 'GeoIP Lookup',
          next: ['whois-1'],
        },
        {
          id: 'whois-1',
          type: 'whois',
          name: 'WHOIS Lookup',
          next: ['vt-1'],
        },
        {
          id: 'vt-1',
          type: 'virustotal',
          name: 'VirusTotal Check',
          next: ['reverse-geo-1'],
        },
        {
          id: 'reverse-geo-1',
          type: 'reverse_geocode',
          name: 'Reverse Geocode',
          next: ['output-1'],
        },
        {
          id: 'output-1',
          type: 'output',
          name: 'Attach Results',
          params: {
            text: 'Full enrichment completed: GeoIP, WHOIS, VirusTotal, and Reverse Geocode data attached',
          },
          next: [],
        },
      ],
    },
  },
  {
    id: 'webhook-notify',
    name: 'Webhook Notify',
    description: 'Enrich IP and send results to webhook',
    jsonBody: {
      version: '1.0.0',
      entry: 'geoip-1',
      steps: [
        {
          id: 'geoip-1',
          type: 'geoip',
          name: 'GeoIP Lookup',
          next: ['webhook-1'],
        },
        {
          id: 'webhook-1',
          type: 'http_post',
          name: 'Send to Webhook',
          params: {
            url: 'https://webhook.example.com/api/endpoint',
            headers: {
              'Content-Type': 'application/json',
            },
          },
          next: ['output-1'],
        },
        {
          id: 'output-1',
          type: 'output',
          name: 'Attach Note',
          params: {
            text: 'Enrichment completed and webhook notified',
          },
          next: [],
        },
      ],
    },
  },
];

export function getTemplate(id: string): PlaybookTemplate | undefined {
  return PLAYBOOK_TEMPLATES.find(t => t.id === id);
}

