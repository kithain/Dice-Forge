const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../js/verbal-obs-control.js'), 'utf8').replace('export function', 'function');
const sent = [];
const states = new Map();
function player() {
  const elements = {};
  const control = { room: 'TEST_A', fail: false, copied: null };
  const context = {
    document: { getElementById() { throw new Error('La synchronisation OBS ne doit pas dépendre de contrôles sur l’écran joueur'); } },
    localStorage: { getItem: () => JSON.stringify({ code: control.room }) },
    location: { href: 'http://127.0.0.1:8765/index.html' },
    navigator: { clipboard: { writeText: async text => { control.copied = text; } } },
    URL, AbortSignal, crypto: webcrypto,
    fetch: async (url, options) => {
      const payload = JSON.parse(options.body);
      sent.push({ url, payload });
      if (control.fail) return { ok: false };
      const room = new URL(url, context.location.href).searchParams.get('room');
      let state = states.get(room) || { visible: false, revision: 0 };
      if (payload.new_draw || state.draw_id === payload.draw_id) {
        state = { ...payload, revision: state.revision + 1 };
        states.set(room, state);
      }
      return { ok: true, json: async () => structuredClone(state) };
    }
  };
  vm.createContext(context);
  vm.runInContext(source + '\nthis.update = createVerbalObs();', context);
  return { ...control, elements, update: context.update, control };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const first = player();
  const second = player();
  const payload = { character: 'Ilya', approach: 'Persuader', words: Array.from({ length: 6 }, (_, i) => ({ word: `Mot ${i}`, used: false, discarded: false })) };
  first.update(null);
  first.update(payload);
  await settle();
  assert.equal(sent.length, 0, 'Pas de publication avant un nouveau tirage');
  first.update(payload, true);
  await settle();
  const firstDraw = sent.at(-1).payload.draw_id;
  assert.equal(sent.at(-1).payload.visible, true);
  assert.equal(sent.at(-1).payload.new_draw, true);
  assert.match(firstDraw, /^[a-f0-9]{32}$/);
  const modified = structuredClone(payload);
  modified.words[0].used = true;
  modified.words[1].discarded = true;
  first.update(modified);
  await settle();
  assert.equal(sent.at(-1).payload.draw_id, firstDraw);
  assert.equal(sent.at(-1).payload.new_draw, false);
  assert.equal(sent.at(-1).payload.words[0].used, true);
  assert.equal(sent.at(-1).payload.words[1].discarded, true);
  second.update({ ...payload, character: 'Autre joueur' }, true);
  await settle();
  const secondDraw = states.get('TEST_A').draw_id;
  assert.notEqual(firstDraw, secondDraw);
  first.update(payload);
  await settle();
  assert.equal(states.get('TEST_A').character, 'Autre joueur', 'Modifier un ancien tirage ne reprend pas la place');
  const beforeReset = sent.length;
  first.update(null);
  second.update(null);
  await settle();
  assert.equal(sent.length, beforeReset, 'Remise à zéro locale sans masquer OBS');
  assert.equal(states.get('TEST_A').draw_id, secondDraw);
  first.control.room = 'TEST_B';
  first.update(payload);
  await settle();
  assert.equal(sent.length, beforeReset, 'Pas de transfert d’un ancien tirage vers un autre salon');
  first.update(payload, true);
  await settle();
  assert.ok(sent.at(-1).url.includes('TEST_B'));
  assert.equal(states.get('TEST_A').draw_id, secondDraw, 'L’ancien salon garde son dernier tirage');
  first.control.fail = true;
  first.update(payload, true);
  await settle();
  assert.equal(sent.at(-1).payload.new_draw, true);
  first.control.fail = false;
  first.update(payload, true);
  await settle();
  assert.equal(states.get('TEST_B').draw_id, sent.at(-1).payload.draw_id);
  const beforeCancel = sent.length;
  first.update(payload, true);
  first.update(null);
  await settle();
  assert.equal(sent.length, beforeCancel, 'Un tirage annulé avant son envoi ne remplace pas OBS');
  first.update({ ...payload, character: 'Ancien' }, true);
  first.update({ ...payload, character: 'Dernier' }, true);
  await settle();
  assert.equal(sent.length, beforeCancel + 1, 'Seul le dernier tirage en attente est envoyé');
  assert.equal(states.get('TEST_B').character, 'Dernier');
  assert.equal(first.elements['verbal-obs-show'], undefined);
  assert.equal(first.elements['verbal-obs-hide'], undefined);
  console.log('OK : tirage automatique, suivi des mots et jokers, priorité au dernier tirage, salons isolés, erreur réseau et annulation des envois périmés.');
})().catch(error => { console.error(error); process.exitCode = 1; });
