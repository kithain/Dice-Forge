import type { ClientMessage, ServerMessage, SessionState } from '../shared/contracts.js';

export class RealtimeClient extends EventTarget {
  #socket?: WebSocket;
  #retry?: number;

  connect(): void {
    window.clearTimeout(this.#retry);
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.#socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.#socket.addEventListener('open', () => this.dispatchEvent(new Event('connected')));
    this.#socket.addEventListener('close', () => {
      this.dispatchEvent(new Event('disconnected'));
      this.#retry = window.setTimeout(() => this.connect(), 1500);
    });
    this.#socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      this.dispatchEvent(new CustomEvent('message', { detail: message }));
    });
  }

  sendSession(session: SessionState): void {
    this.#send({ type: 'session', session });
  }

  #send(message: ClientMessage): void {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(JSON.stringify(message));
    }
  }
}
