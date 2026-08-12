import { access, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { AppConfig } from '../config.js';

async function exists(target: string): Promise<boolean> {
  try { await access(target); return true; } catch { return false; }
}

async function copyMissing(source: string, destination: string): Promise<void> {
  if (!await exists(source)) return;
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: false, errorOnExist: false });
}

export async function migrateLegacyData(config: AppConfig): Promise<void> {
  await mkdir(config.dataDirectory, { recursive: true });
  await Promise.all([
    copyMissing(config.legacyData, config.dataDirectory),
    copyMissing(config.legacyMaps, config.mapsDirectory),
    copyMissing(config.legacyPortraits, config.portraitsDirectory),
  ]);
}
