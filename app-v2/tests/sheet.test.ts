import { describe, expect, it } from 'vitest';

import { editableSheetMarkdown, playableSheet, resetExperienceChecks, skillBase, structuredSheetToMarkdown } from '../src/shared/sheet.js';

const structured = {
  fields: { name: 'Thokk Le Briseur', player: 'Kitha', armorType: 'Cuir', equipment: 'Corde\nTorche' },
  stats: { force: '16', constitution: '14' },
  skills: [{ base: '15', points: '20', score: '35', checked: true }],
  weapons: [{ name: 'Hache', contactScore: '65', damage: '1d8' }],
  spells: [{ name: 'Protection', points: '10', checked: false }],
};

describe('complete character sheet', () => {
  it('renders structured Supabase data as readable Markdown', () => {
    const markdown = structuredSheetToMarkdown(structured, 'Fallback');
    expect(markdown).toContain('# Thokk Le Briseur');
    expect(markdown).toContain('| Estimation | 15 | 20 | 35 | ✓ |');
    expect(markdown).toContain('| Hache | Contact 65 | 1d8 |');
    expect(markdown).toContain('| Protection | 10 |');
    expect(markdown).not.toContain('[object Object]');
  });

  it('repairs previously corrupted Markdown from the structured data', () => {
    expect(editableSheetMarkdown(structured, '**Compétences**\n[object Object]')).toContain('| Estimation |');
  });

  it('keeps valid existing Markdown unchanged', () => {
    expect(editableSheetMarkdown(structured, '# Texte personnalisé')).toBe('# Texte personnalisé');
  });

  it('builds a playable view model with derived values', () => {
    const model = playableSheet({ ...structured, stats: { constitution: '14', taille: '15', pouvoir: '9', dexterite: '12' } });
    expect(model.hp).toBe(15);
    expect(model.powerPoints).toBe(9);
    expect(model.course).toBe(66);
    expect(model.skills[0]).toMatchObject({ name: 'Estimation', group: 'Pratique & divers', score: 35 });
    expect(model.weapons[0]).toMatchObject({ name: 'Hache', contactScore: 65 });
  });

  it('calculates attribute-based skill bases from the BRP rules', () => {
    const stats = { dexterite: 13, intelligence: 10, pouvoir: 6 };
    expect(skillBase('Défense', stats)).toBe(26);
    expect(skillBase('Vol', stats)).toBe(7);
    expect(skillBase('Jeux', stats)).toBe(16);
    expect(skillBase('Langue (divers)', stats)).toBe(50);
    expect(skillBase('Bagarre', stats)).toBe(25);
  });

  it('resets experience checks without changing character progression', () => {
    const exported = resetExperienceChecks(structured);
    expect((exported.skills as Array<Record<string, unknown>>)[0]).toMatchObject({ points: '20', score: '35', checked: false });
    expect((exported.spells as Array<Record<string, unknown>>)[0]).toMatchObject({ points: '10', checked: false });
    expect(exported.fields).toEqual(structured.fields);
  });
});
