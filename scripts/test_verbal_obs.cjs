const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/verbal-obs-control.js'), 'utf8').replace('export function', 'function');
const elements = {};
let room = 'TEST_A';
const sent = [];
let fail = false;
const context = {
  document: { getElementById(id) { return elements[id] ||= { listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } }; } },
  localStorage: { getItem: () => JSON.stringify({ code: room }) },
  location: { href: 'http://127.0.0.1:8765/index.html' },
  navigator: { clipboard: { writeText: async () => {} } },
  URL, AbortSignal,
  fetch: async (url, options) => { sent.push({ url, payload: JSON.parse(options.body) }); return { ok: !fail }; }
};
vm.createContext(context);
vm.runInContext(source + '\nthis.update = createVerbalObs();', context);
const settle = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const payload = { character: 'Ilya', approach: 'Persuasion', words: [] };
  context.update(payload);
  assert.equal(sent.length, 0, 'Pas de publication avant Afficher');
  elements['verbal-obs-show'].listeners.click();
  await settle();
  assert.equal(sent.at(-1).payload.visible, true);
  context.update({ ...payload, words: [{ word: 'Raison', used: true, discarded: false }] });
  await settle();
  assert.equal(sent.at(-1).payload.words[0].used, true);
  elements['verbal-obs-hide'].listeners.click();
  await settle();
  assert.equal(sent.at(-1).payload.visible, false);
  elements['verbal-obs-show'].listeners.click();
  await settle();
  room = 'TEST_B';
  context.update(payload);
  await settle();
  assert.ok(sent.at(-2).url.includes('TEST_A'));
  assert.equal(sent.at(-2).payload.visible, false);
  assert.ok(sent.at(-1).url.includes('TEST_B'));
  assert.equal(sent.at(-1).payload.visible, false);
  fail = true;
  elements['verbal-obs-show'].listeners.click();
  await settle();
  assert.match(elements['verbal-obs-status'].textContent, /indisponible/);
  context.update(null);
  await settle();
  assert.equal(elements['verbal-obs-show'].disabled, true);
  console.log('OK : affichage explicite, suivi, masquage, changement de salon, erreur réseau et remise à zéro.');
})().catch(error => { console.error(error); process.exitCode = 1; });
