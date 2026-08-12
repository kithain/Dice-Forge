export interface MapToken {
  id: string;
  x: number;
  y: number;
  size: number;
  color: string;
  name: string;
  portraitUrl: string | null;
  marker: number | null;
}

export interface BattlemapState {
  map: string | null;
  tokens: MapToken[];
}

export function normalizeToken(value: Record<string, unknown>): MapToken {
  return {
    id: String(value.id || crypto.randomUUID()),
    x: Number(value.x) || 0,
    y: Number(value.y) || 0,
    size: Math.max(20, Math.min(240, Number(value.size) || 50)),
    color: String(value.color || '#4A90E2'),
    name: String(value.name || 'Token').slice(0, 80),
    portraitUrl: typeof value.portraitUrl === 'string' ? value.portraitUrl : null,
    marker: Number.isInteger(Number(value.marker)) ? Number(value.marker) : null,
  };
}
