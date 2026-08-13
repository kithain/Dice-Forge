import { describe, expect, it } from 'vitest';

import { parseCombatScores } from '../src/server/services/obsidian-service.js';
import { normalizeRoomNpc, normalizeRoomNpcState } from '../src/shared/room-npcs.js';

describe('room NPCs', () => {
  it('keeps only the fast combat values', () => {
    expect(normalizeRoomNpc({ name: ' Garde ', meleeAttack: 62, rangedAttack: 48, defense: 41 })).toMatchObject({ name: 'Garde', meleeAttack: 62, rangedAttack: 48, defense: 41 });
  });

  it('migrates the old attack score to melee and clamps scores', () => {
    const state = normalizeRoomNpcState({ rooms: { ABC123: [{ name: 'Ogre', attack: 130, defense: 0 }] } });
    expect(state.rooms.ABC123?.[0]).toMatchObject({ meleeAttack: 100, rangedAttack: 0, defense: 1 });
  });
});

describe('Obsidian combat values', () => {
  it('reads the best attack and dodge from a bestiary entry', () => {
    const markdown = `| Attaque | Chance | Dégâts |
|---|--:|--:|
| Épée | 35 % | 1D6 |
| Fronde | 25 % | 1D4 |

**Compétences :** Escalade 45 %, Esquive 30 %, Observation 40 %.`;
    expect(parseCombatScores(markdown)).toEqual({ meleeAttack: 35, rangedAttack: 25, defense: 30 });
  });

  it('reads inline and multiline PNJ attacks', () => {
    expect(parseCombatScores('**Attaques :** Arc 60%, dégâts 1D6 ; Couteau 50%\n**Compétences :** Esquive 45%')).toEqual({ meleeAttack: 50, rangedAttack: 60, defense: 45 });
    expect(parseCombatScores('**Attaques :**\n\n- Fronde 40%, dégâts 1D4\n- Couteau 30%, dégâts 1D4\n\n**Compétences :** Discrétion 70%')).toEqual({ meleeAttack: 30, rangedAttack: 40, defense: 50 });
  });

  it('keeps a melee spear distinct from a thrown weapon', () => {
    expect(parseCombatScores('**Attaques :**\n- Lance courte 55%, dégâts 1D6\n- Couteau lancé 40%, dégâts 1D4')).toMatchObject({ meleeAttack: 55, rangedAttack: 40 });
  });

  it('lets explicit values override inferred values for other NPCs', () => {
    expect(parseCombatScores('---\nattaque_cac: 72\nattaque_distance: 64\ndefense: 58\n---\n**Attaques :** Couteau 30%')).toEqual({ meleeAttack: 72, rangedAttack: 64, defense: 58 });
  });
});
