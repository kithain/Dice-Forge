import { randomUUID } from 'node:crypto';

import type { WebSocket } from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { ClientMessage, ServerMessage } from '../shared/contracts.js';

export class RealtimeHub {
  readonly #clients = new Set<WebSocket>();

  register(app: FastifyInstance): void {
    app.get('/ws', { websocket: true }, (socket: WebSocket) => {
      this.#clients.add(socket);
      this.#send(socket, { type: 'connected', clientId: randomUUID() });
      socket.on('close', () => this.#clients.delete(socket));
      socket.on('message', (data: unknown) => {
        try {
          const message = JSON.parse(String(data)) as ClientMessage;
          if (message.type === 'ping') this.#send(socket, { type: 'pong', at: new Date().toISOString() });
          if (message.type === 'session') this.#send(socket, message);
        } catch {
          socket.close(1003, 'Message invalide');
        }
      });
    });
  }

  broadcast(message: ServerMessage): void {
    for (const client of this.#clients) if (client.readyState === client.OPEN) this.#send(client, message);
  }

  #send(socket: WebSocket, message: ServerMessage): void {
    socket.send(JSON.stringify(message));
  }
}
