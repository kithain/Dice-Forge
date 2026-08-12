import { describe, expect, it } from 'vitest';

import { shouldServeSpaIndex } from '../src/server/app.js';

describe('server routing', () => {
  it('serves the SPA for browser navigation routes', () => {
    expect(shouldServeSpaIndex('GET', '/characters?room=TEST', 'text/html,application/xhtml+xml')).toBe(true);
  });

  it('never replaces a missing built asset with index.html', () => {
    expect(shouldServeSpaIndex('GET', '/assets/index-old.js', 'text/html,*/*')).toBe(false);
  });

  it('does not mask missing API routes', () => {
    expect(shouldServeSpaIndex('GET', '/api/missing', 'text/html')).toBe(false);
  });
});
