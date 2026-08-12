import { describe, expect, it } from 'vitest';

import { parseEquipmentCatalog, sanitizeReferenceHtml } from '../src/server/routes/reference-routes.js';

describe('reference documents', () => {
  it('reveals legacy pages after removing their authentication scripts', () => {
    const source = '<html lang="fr" class="theme auth-pending"><head></head><body>Visible<script>authenticate()</script></body></html>';

    const result = sanitizeReferenceHtml(source);

    expect(result).not.toContain('auth-pending');
    expect(result).not.toContain('<script');
    expect(result).toContain('<base href="/reference-assets/">');
    expect(result).toContain('<body>Visible</body>');
  });
});

describe('equipment catalog', () => {
  it('extracts weapons and armor from the reference tables', () => {
    const markdown = '## Armes de mêlée\n\n| Arme | Description | Catégorie | Dégâts | Mains | Particularités | Prix |\n|---|---|---|---|---|---|---|\n| Pioche | Bec | Martiale | 1d8 | 1 | Perforante | 25 po |\n\n## Armures\n\n| Armure | Description | Type | PA | Mobilité | Discrétion | Prix |\n|---|---|---|---|---|---|---|\n| Cuir | Souple | Légère | 2 | Bonne | Bonne | 10 po |';
    const catalog = parseEquipmentCatalog(markdown);
    expect(catalog.weapons[0]).toMatchObject({ name: 'Pioche', damage: '1d8', category: 'Martiale' });
    expect(catalog.armors[0]).toMatchObject({ name: 'Cuir', armorPoints: 2, mobility: 'Bonne' });
  });
});
