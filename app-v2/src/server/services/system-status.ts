import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { ServiceStatus, SystemStatus } from '../../shared/contracts.js';
import type { AppConfig } from '../config.js';

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function supabaseStatus(config: AppConfig): Promise<ServiceStatus> {
  const configPath = path.join(config.repositoryRoot, 'supabase-config.js');
  const content = await readFile(configPath, 'utf8').catch(() => '');
  const ready = content.includes('supabase.co')
    && !content.includes('YOUR_SUPABASE')
    && /anonKey\s*:/.test(content);
  return {
    id: 'supabase',
    label: 'Supabase',
    detail: ready ? 'Configuration cliente détectée' : 'Configuration cliente absente',
    state: ready ? 'available' : 'degraded',
  };
}

async function obsidianStatus(config: AppConfig): Promise<ServiceStatus> {
  const ready = await exists(config.vaultPath);
  return {
    id: 'obsidian',
    label: 'Obsidian',
    detail: ready ? 'Coffre local accessible' : 'Coffre local introuvable',
    state: ready ? 'available' : 'degraded',
  };
}

async function localDataStatus(
  config: AppConfig,
  id: 'tracker' | 'battlemap',
  label: string,
  files: string[],
): Promise<ServiceStatus> {
  const availableFiles = await Promise.all(
    files.map(async (file) => exists(path.join(config.dataDirectory, file))),
  );
  const count = availableFiles.filter(Boolean).length;
  return {
    id,
    label,
    detail: count ? `${count}/${files.length} source(s) locale(s) trouvée(s)` : 'Prêt pour un nouvel état local',
    state: 'available',
  };
}

export async function getSystemStatus(config: AppConfig): Promise<SystemStatus> {
  await readdir(config.dataDirectory).catch(() => []);
  const services = await Promise.all([
    Promise.resolve<ServiceStatus>({
      id: 'server',
      label: 'Serveur V2',
      detail: 'TypeScript · Fastify · WebSocket',
      state: 'available',
    }),
    supabaseStatus(config),
    obsidianStatus(config),
    localDataStatus(config, 'tracker', 'Tracker', ['combat_autosave.json', 'players.json']),
    localDataStatus(config, 'battlemap', 'Battle Map', ['battlemap_map.json', 'battlemap_tokens.json']),
  ]);
  return {
    version: '0.1.0',
    checkedAt: new Date().toISOString(),
    services,
  };
}
