// Behavioral checks without a browser: persistence and import must preserve notes.
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = readFileSync(require('node:path').join(__dirname, '../js/suivi-mj.js'), 'utf8');
class Element {
  constructor(tag = '') { this.tag = tag; this.children = []; this.events = {}; this.value = ''; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, callback) { this.events[name] = callback; }
  focus() {}
  get lastElementChild() { return this.children.at(-1); }
  querySelector(tag) { return this.children.filter(x => x instanceof Element).flatMap(x => [x, x.querySelector(tag)]).find(x => x?.tag === tag); }
}
function boot(saved) {
  const nodes = new Map(); let stored = saved; let failSave = false; let confirmed = true;
  const get = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  vm.runInNewContext(source, {
    document: { getElementById: get, createElement: tag => new Element(tag) },
    localStorage: { getItem: () => stored, setItem: (_, value) => { if (failSave) throw Error('quota'); stored = value; } },
    URLSearchParams,
    window: { confirm: () => confirmed, location: { search: '?room=', pathname: '/suivi-mj.html' } },
  });
  return { get, saved: () => stored, fail: () => { failSave = true; }, cancel: () => { confirmed = false; } };
}
(async () => {
  const app = boot(null);
  app.get('add-pj').events.click();
  const name = app.get('cards').children[0].querySelector('input');
  name.value = '<img src=x onerror=alert(1)>'; name.events.input();
  assert.equal(JSON.parse(app.saved()).characters[0].name, name.value);
  const restored = boot(app.saved());
  assert.equal(restored.get('cards').children[0].querySelector('input').value, name.value);
  assert.equal(restored.get('roster').children.length, 1);
  const before = restored.saved();
  await restored.get('file').events.change({ target: { files: [{ size: 3, text: async () => '{}' }] } });
  assert.equal(restored.saved(), before);
  assert.match(restored.get('save-state').textContent, /Import refusé/);
  const imported = { version: 1, campaign: 'Test', characters: [{ name: 'Aëlin', hp: '0', hpMax: '12', secret: 'Une dette' }], group: { gold: '42' } };
  await restored.get('file').events.change({ target: { files: [{ size: 500, text: async () => JSON.stringify(imported) }] } });
  assert.equal(JSON.parse(restored.saved()).characters[0].secret, 'Une dette');
  assert.equal(restored.get('roster').children[0].children[2].textContent, '0 / 12');
  restored.cancel();
  const snapshot = restored.saved();
  await restored.get('file').events.change({ target: { files: [{ size: 500, text: async () => JSON.stringify({ ...imported, campaign: 'Replacement' }) }] } });
  assert.equal(restored.saved(), snapshot);
  restored.fail(); restored.get('campaign').events.input({ target: { value: 'Notes en mémoire' } });
  assert.match(restored.get('save-state').textContent, /Échec/);
  console.log('MJ notebook: persistence, restore, safe text, valid/invalid/cancelled import, zero HP and storage failure passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
