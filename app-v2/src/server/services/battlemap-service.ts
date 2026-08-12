import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { normalizeToken, type BattlemapState, type MapToken } from '../../shared/battlemap.js';
import { JsonStore } from '../storage/json-store.js';

const MAX_MAP_BYTES = 50 * 1024 * 1024;

function extension(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'gif';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return undefined;
}

export class BattlemapService {
  readonly #mapStore: JsonStore<{ map: string | null }>;
  readonly #tokenStore: JsonStore<{ tokens: MapToken[] }>;
  #state: BattlemapState = { map: null, tokens: [] };

  constructor(dataDirectory: string, readonly mapsDirectory: string) {
    this.#mapStore = new JsonStore(path.join(dataDirectory, 'battlemap_map.json'), () => ({ map: null }), (source) => ({ map: typeof source.map === 'string' ? source.map : null }));
    this.#tokenStore = new JsonStore(path.join(dataDirectory, 'battlemap_tokens.json'), () => ({ tokens: [] }), (source) => ({ tokens: Array.isArray(source.tokens) ? source.tokens.map((token) => normalizeToken(token as Record<string, unknown>)) : [] }));
  }

  async initialize(): Promise<void> {
    const [map, tokens] = await Promise.all([this.#mapStore.read(), this.#tokenStore.read()]);
    this.#state = { map: map.map, tokens: tokens.tokens };
  }

  snapshot(): BattlemapState { return structuredClone(this.#state); }

  async upsertToken(source: Record<string, unknown>): Promise<BattlemapState> {
    const token = normalizeToken(source);
    const index = this.#state.tokens.findIndex((item) => item.id === token.id);
    if (index >= 0) this.#state.tokens[index] = { ...this.#state.tokens[index]!, ...token };
    else this.#state.tokens.push(token);
    await this.#tokenStore.write({ tokens: this.#state.tokens });
    return this.snapshot();
  }

  async removeToken(id: string): Promise<BattlemapState> {
    this.#state.tokens = this.#state.tokens.filter((token) => token.id !== id);
    await this.#tokenStore.write({ tokens: this.#state.tokens });
    return this.snapshot();
  }

  async clearTokens(): Promise<BattlemapState> {
    this.#state.tokens = [];
    await this.#tokenStore.write({ tokens: [] });
    return this.snapshot();
  }

  async saveMap(bytes: Buffer): Promise<BattlemapState> {
    if (!bytes.length) throw new Error('Le fichier est vide.');
    if (bytes.length > MAX_MAP_BYTES) throw new Error('La carte dépasse 50 Mo.');
    const detected = extension(bytes);
    if (!detected) throw new Error('Utilisez une image PNG, JPEG, GIF ou WebP.');
    await mkdir(this.mapsDirectory, { recursive: true });
    const filename = `current_map.${detected}`;
    const destination = path.join(this.mapsDirectory, filename);
    const temporary = path.join(this.mapsDirectory, `.upload-${randomUUID()}.tmp`);
    await writeFile(temporary, bytes);
    await rename(temporary, destination);
    this.#state.map = `/maps/${filename}`;
    await this.#mapStore.write({ map: this.#state.map });
    return this.snapshot();
  }
}
