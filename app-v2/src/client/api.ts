import type { SystemStatus } from '../shared/contracts.js';

export async function fetchSystemStatus(): Promise<SystemStatus> {
  const response = await fetch('/api/status', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Diagnostic indisponible (${response.status})`);
  return response.json() as Promise<SystemStatus>;
}
