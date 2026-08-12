export type ServiceState = 'available' | 'degraded' | 'unavailable';

export interface ServiceStatus {
  id: 'server' | 'supabase' | 'obsidian' | 'tracker' | 'battlemap';
  label: string;
  detail: string;
  state: ServiceState;
}

export interface SystemStatus {
  version: string;
  checkedAt: string;
  services: ServiceStatus[];
}

export interface SessionState {
  room: string;
  playerName: string;
}

export type ServerMessage =
  | { type: 'connected'; clientId: string }
  | { type: 'pong'; at: string }
  | { type: 'session'; session: SessionState }
  | { type: 'combat.changed' }
  | { type: 'battlemap.changed' };

export type ClientMessage =
  | { type: 'ping' }
  | { type: 'session'; session: SessionState };
