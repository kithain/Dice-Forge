import type { FastifyInstance } from 'fastify';

import type { ObsidianSource, ObsidianService } from '../services/obsidian-service.js';

type SearchQuery = { q?: string; type?: ObsidianSource };

export function registerObsidianRoutes(app: FastifyInstance, obsidian: ObsidianService): void {
  app.get<{ Querystring: SearchQuery }>('/api/obsidian', async (request) => {
    return obsidian.scan(request.query.q ?? '', request.query.type);
  });
}
