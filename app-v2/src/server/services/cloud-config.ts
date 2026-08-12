import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppConfig } from '../config.js';

export interface PublicCloudConfig { url: string; anonKey: string }

export async function getCloudConfig(config: AppConfig): Promise<PublicCloudConfig | null> {
  const source = await readFile(path.join(config.repositoryRoot, 'supabase-config.js'), 'utf8').catch(() => '');
  const url = source.match(/url\s*:\s*['"]([^'"]+)['"]/)?.[1];
  const anonKey = source.match(/anonKey\s*:\s*['"]([^'"]+)['"]/)?.[1];
  if (!url || !anonKey || url.includes('YOUR_SUPABASE')) return null;
  return { url, anonKey };
}
