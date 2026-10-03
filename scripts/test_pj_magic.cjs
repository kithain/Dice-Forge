const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'js/pj-magic.js'), 'utf8');
  const helpers = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const { creationBudgetErrors } = await import('../js/creation-budget.js');
  const { normalizeSpells, magicErrors, mergeMagicSheet, patchMagicMarkdown } = helpers;
  const saved = {
    fields: { name: 'Test', profession: 'Sorcier', skillProfessionalPool: '325', notes: 'Notes serveur', powers: 'Ancien pouvoir', extra: 'À conserver' },
    stats: { intelligence: '15', force: '12' }, skills: [{ points: '100', checked: true }],
    weapons: [{ name: 'Bâton' }], privateField: { preserved: true },
    spells: [{ name: 'Blessure', points: '10', checked: false, extra: 'Détail' }, { name: '', points: '0' },
      ...['Feu', 'Givre', 'Protection', 'Illusion', 'Lévitation', 'Lumière'].map(name => ({ name, points: '10', checked: false }))]
  };
  const desired = normalizeSpells(saved.spells);
  const learned={name:'Feu',points:32,allocation:{base:0,score:32,origin:'learning',learning_points:32,xp_points:0}};
  assert.equal(helpers.spellScore({stats:{intelligence:18}},learned),32);
  assert.equal(helpers.spellScore({stats:{intelligence:22}},learned),32,'INT does not alter learned score');
  assert.equal(helpers.spellScore({stats:{intelligence:22}},{...learned,points:34,allocation:{...learned.allocation,xp_points:2}}),34);
  assert.equal(helpers.spellScore({stats:{intelligence:18}},{name:'Feu',base:0,points:32}),32,'Markdown import keeps exact learned score');
  assert.equal(helpers.magicBudget({creation:{phase:'play',professional:0,personal:180},stats:{intelligence:22},skills:[{points:180}],progression:{learning_points:32}},[learned],[0]).remaining,0,'INT changes and learning never recreate initial credit');
  const acquired={...structuredClone(saved),creation:{phase:'play'},progression:{xp_points:10},fields:{...saved.fields,skillProfessionalPool:'0'},skills:[{points:150}],spells:[{name:'Feu',points:10,checked:true}]};
  assert.deepEqual(magicErrors(acquired,normalizeSpells(acquired.spells),[],[0]),[],'XP never consumes the frozen creation budget again');
  assert(magicErrors(acquired,[{name:'Feu',points:9}],[],[0]).some(e=>e.includes('verrouillés')),'Acquired spell allocation cannot be lowered');
  desired[0].points = '25';
  desired.push({ name: 'Foudre', points: '20', checked: false });
  assert.equal(normalizeSpells(saved.spells).filter(row => row.name).length, 7, 'Tous les sorts sont conservés, au-delà de six');
  assert.deepEqual(magicErrors(saved, desired, ['Foudre'], [0]), []);
  const merged = mergeMagicSheet(saved, desired, 'Nouveau pouvoir');
  assert.equal(merged.spells[0].name, 'Blessure');
  assert.equal(merged.spells[0].points, '25');
  assert.equal(merged.spells[0].extra, 'Détail');
  assert.equal(merged.spells[1].name, 'Foudre', 'Le nouvel ajout utilise un emplacement libre');
  assert.equal(merged.spells[2].name, 'Feu', 'Les indices du lanceur restent stables');
  assert.deepEqual(merged.stats, saved.stats);
  assert.deepEqual(merged.skills, saved.skills);
  assert.deepEqual(merged.weapons, saved.weapons);
  assert.deepEqual(merged.privateField, saved.privateField);
  assert.equal(merged.fields.notes, saved.fields.notes);
  assert.equal(merged.fields.extra, saved.fields.extra);
  assert.equal(merged.fields.powers, 'Nouveau pouvoir');
  assert.equal(saved.spells[0].points, '10', 'La source n’est pas modifiée');
  const replaced = normalizeSpells(saved.spells); replaced[0].name = 'Foudre';
  assert(magicErrors(saved, replaced, ['Foudre'], [0]).some(message => message.includes('doit être conservé')));
  assert(magicErrors(saved, [...desired, desired[0]], ['Foudre'], [0]).some(message => message.includes('déjà présent')));
  const excessive = normalizeSpells(saved.spells); excessive[0].points = '500';
  assert(magicErrors(saved, excessive, [], [0]).some(message => message.includes('Budget dépassé')));
  for (const value of ['', '-1', '1.5', 'NaN']) {
    const invalid = normalizeSpells(saved.spells); invalid[0].points = value;
    assert(magicErrors(saved, invalid, [], [0]).some(message => message.includes('entiers')));
  }
  const markdown = '# Test\n\n## Compétences\n\n- **Points répartis :** 170\n- **Points restants :** 305\n\n| Bagarre | 25 | 100 | 125 | [x] |\n| Blessure | 15 | 10 | 25 | [ ] |\n\n## Armes\n\n| Bâton | 35 | 1d6 |\n\n## Sorts / pouvoirs\n\n- Ancien pouvoir\n\n## Notes de jeu\n\n- Notes serveur\n';
  const updatedMd = patchMagicMarkdown(markdown, saved, merged);
  assert.match(updatedMd, /\| Blessure \| 15 \| 25 \| 40 \|/);
  assert.match(updatedMd, /\| Foudre \| 15 \| 20 \| 35 \|/);
  assert(updatedMd.includes('## Armes\n\n| Bâton | 35 | 1d6 |\n'));
  assert(updatedMd.includes('## Notes de jeu\n\n- Notes serveur\n'));
  assert.match(updatedMd, /\*\*Points répartis :\*\* 205/);
  assert.match(updatedMd, /- Nouveau pouvoir/);

  // Exécute le vrai gestionnaire du bouton avec un transport Supabase simulé.
  const sheetCode = fs.readFileSync(path.join(root, 'js/pj-sheet.js'), 'utf8');
  const handler = sheetCode.slice(sheetCode.indexOf('async function saveSpells()'), sheetCode.indexOf('async function saveSheetToSupabase()'));
  async function exercise({ proposed = desired, race = false, absent = false } = {}) {
    let patch = null, conditions = [], messages = [];
    const button = { disabled: false };
    const query = (answer, write = false) => ({
      eq(key, value) { if (write) conditions.push([key, value]); return this; },
      select() { return this; }, async maybeSingle() { return answer; }
    });
    const context = {
      ...helpers, creationBudgetErrors, budgetSheet: () => saved, budgetSkills: () => saved.skills,
      magicSaveInProgress: false, magicEditRevision: 1,
      spellSlots: structuredClone(proposed), spellSheetContext: null, saveTimer: null,
      structuredClone, Date, ACTIVE_SKILLS: [{ index: 0 }], STORAGE_KEY: 'test',
      syncSpellSlotsFromForm() {}, currentRoom: () => ({ userId: 'owner', code: 'TEST', player: 'Joueur' }),
      availableNewSpells: () => ['Foudre'], updateMagicCalculations() {}, renderSpellRows() {}, clearTimeout() {},
      setSpellStatus(message) { messages.push(message); }, supabaseErrorMessage: error => error.message,
      setStatus() {},
      collectData: () => ({ fields: { notes: 'Modifications locales hors onglet' }, stats: { intelligence: '99' } }),
      localStorage: { setItem() {} },
      document: { getElementById: id => id === 'pj-spell-add-panel' ? { hidden: true } : button },
      form: { querySelector: () => ({ value: 'Nouveau pouvoir' }) },
      supabase: { from(table) {
        assert.equal(table, 'pj_sheets');
        return {
          select: () => query({ data: absent ? null : { id: 42, sheet_data: structuredClone(saved), updated_at: 'original', markdown_content: markdown }, error: null }),
          update(value) { patch = value; return query({ data: race ? null : { id: 42 }, error: null }, true); },
          upsert() { throw new Error('Une sauvegarde de sorts ne doit pas écraser la fiche entière.'); }
        };
      } }
    };
    vm.createContext(context);
    await vm.runInContext(handler + '\nsaveSpells();', context);
    assert.equal(button.disabled, false);
    return { patch, conditions, messages };
  }
  const success = await exercise();
  assert.deepEqual(Object.keys(success.patch).sort(), ['markdown_content', 'sheet_data', 'updated_at']);
  assert.equal(success.patch.sheet_data.stats.intelligence, '15', 'Le brouillon hors onglet n’est pas envoyé');
  assert.equal(success.patch.sheet_data.fields.notes, 'Notes serveur');
  assert.deepEqual(success.patch.sheet_data.skills, saved.skills);
  assert(success.messages.some(message => message.includes('sauvegardés dans Supabase')), 'Le gestionnaire termine sans erreur');
  assert(success.conditions.some(([key, value]) => key === 'updated_at' && value === 'original'), 'Protection contre un écrasement concurrent');
  assert((await exercise({ race: true })).messages.some(message => message.includes('changé pendant')));
  assert.equal((await exercise({ absent: true })).patch, null, 'Aucune fiche vide créée à la place de la fiche du joueur');
  assert.equal((await exercise({ proposed: replaced })).patch, null, 'Pas de remplacement d’un sort enregistré');
  console.log('Grimoire : valeurs, ajout sans doublon, indices stables et sauvegarde limitée à l’onglet validés.');
})().catch(error => { console.error(error); process.exitCode = 1; });
