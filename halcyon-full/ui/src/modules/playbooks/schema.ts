import { z } from 'zod';

export const stepSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['geoip','whois','http_get','http_post','virustotal','reverse_geocode','keyword_match','branch','wait','output']),
  name: z.string().optional(),
  params: z.record(z.any()).optional(),
  onFail: z.enum(['continue','stop']).optional(),
  next: z.array(z.string()).optional()
});

export const playbookJsonSchema = z.object({
  version: z.string().default('1.0.0'),
  entry: z.string().optional(),
  steps: z.array(stepSchema).min(1)
});

