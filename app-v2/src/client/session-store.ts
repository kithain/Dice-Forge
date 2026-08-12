import type { SessionState } from '../shared/contracts.js';
import { EMPTY_SESSION, normalizeSession } from '../shared/session.js';

const STORAGE_KEY = 'dice-forge-v2.session';
type SessionListener = (session: SessionState) => void;

export class SessionStore {
  readonly #listeners = new Set<SessionListener>();
  #state: SessionState;

  constructor(storage: Storage = localStorage) {
    this.storage = storage;
    this.#state = this.#restore();
  }

  private readonly storage: Storage;

  get value(): SessionState {
    return { ...this.#state };
  }

  update(change: Partial<SessionState>): void {
    this.#state = normalizeSession({ ...this.#state, ...change });
    this.storage.setItem(STORAGE_KEY, JSON.stringify(this.#state));
    this.#listeners.forEach((listener) => listener(this.value));
  }

  subscribe(listener: SessionListener): () => void {
    this.#listeners.add(listener);
    listener(this.value);
    return () => this.#listeners.delete(listener);
  }

  #restore(): SessionState {
    try {
      return normalizeSession(JSON.parse(this.storage.getItem(STORAGE_KEY) || 'null') || EMPTY_SESSION);
    } catch {
      return { ...EMPTY_SESSION };
    }
  }
}
