const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');

class Element {
  constructor() { this.children = []; this.listeners = {}; this.textContent = ''; this.value = ''; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  fire(type) { this.listeners[type](); }
  replaceChildren() { this.children = []; }
  append(child) { this.children.push(child); }
  setAttribute() {}
  add(option) { if (!this.children.length) this.value = option.value; this.append(option); }
}
const elements = Object.fromEntries(['panel-verbal', 'verbal-approach', 'verbal-roll', 'verbal-words',
  'verbal-progress', 'verbal-experience', 'verbal-experience-status', 'verbal-level', 'verbal-refresh']
  .map(id => [id, new Element()]));
elements['panel-verbal'].classList = { contains: () => true };
const marked = [];
const frameMarked = [];
let sheet;
let draftKey = 'dice-forge.pj-markdown.v1';
const stored = new Map();
const obsUpdates = [];
const storageListeners = {};
elements['character-sheet-frame'] = { addEventListener() {}, contentWindow: { diceForgeSheet: {
  getData: () => sheet,
  setSkillChecked: (index, checked) => { frameMarked.push(index); sheet.skills[index].checked = checked; }
} } };
const context = {
  document: { getElementById: id => elements[id], createElement: () => new Element() },
  localStorage: { getItem: key => stored.has(key) ? JSON.stringify(stored.get(key)) : key === draftKey ? JSON.stringify(sheet) : null },
  window: { addEventListener(type, listener) { storageListeners[type] = listener; }, markBrpSkillExperience: index => marked.push(index) },
  MutationObserver: class { observe() {} },
  Option: class { constructor(name, value) { this.textContent = name; this.value = value; } },
  crypto: webcrypto, Uint32Array,
  URL, characterDraftKey: () => draftKey,
  createVerbalObs: () => (payload, newDraw) => obsUpdates.push({payload, newDraw})
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/brp-skills.js'), 'utf8')
  .replace(/^export /gm, '') + '\nthis.skills = BRP_SKILLS;', context);
const skillIndex = name => context.skills.findIndex(([label]) => label === name);
sheet = { fields: { name: 'Test' }, skills: context.skills.map(() => ({ score: 0, checked: false })) };
for (const [name, score] of [['Intimidation/Persuasion', 39], ['Représentation', 90], ['Marchandage', 70], ['Baratin', 40]]) {
  sheet.skills[skillIndex(name)].score = score;
}
vm.runInContext(fs.readFileSync(path.join(root, 'js/verbal.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, ''), context);

const select = name => { elements['verbal-approach'].value = name; elements['verbal-approach'].fire('change'); };
const cases = [
  ['Persuader', 'Intimidation/Persuasion', 'Novice', 5],
  ['Intimider', 'Intimidation/Persuasion', 'Novice', 5],
  ['Séduire', 'Représentation', 'Maître', 8],
  ['Négocier', 'Marchandage', 'Expert', 7],
  ['Bluffer', 'Baratin', 'Intermédiaire', 6],
  ['Contraindre', 'Intimidation/Persuasion', 'Novice', 5],
  ['Railler', 'Représentation', 'Maître', 8],
  ['Apaiser', 'Intimidation/Persuasion', 'Novice', 5]
];
for (const [approach, skill, rank, count] of cases) {
  select(approach);
  assert.equal(elements['verbal-words'].children.length, 0, 'Changing approach resets the draw');
  assert.equal(elements['verbal-level'].textContent,
    `${skill} : Rang : ${rank} · ${count}/5 mots à conserver · ${count - 5} joker(s).`);
  elements['verbal-roll'].fire('click');
  const cards = elements['verbal-words'].children;
  assert.equal(cards.length, count, `${approach}: use its own skill score`);
  assert.equal(new Set(cards.map(card => card.children[0].textContent)).size, count);
  for (let joker = 0; joker < count - 5; joker++) elements['verbal-words'].children[joker].children[1].fire('click');
  assert.equal(elements['verbal-words'].children.filter(card => !card.className.includes('discarded')).length, 5);
  if (count > 5) assert.equal(elements['verbal-words'].children.at(-1).children[1].disabled, true);
  elements['verbal-experience'].fire('click');
  assert.equal(marked.at(-1), skillIndex(skill), `${approach}: experience on the selected skill`);
  assert.equal(frameMarked.at(-1), skillIndex(skill), `${approach}: update the visible sheet too`);
}

select('Négocier');
for (const [score, rank, count] of [[0, 'Novice', 5], [39, 'Novice', 5], [40, 'Intermédiaire', 6],
  [69, 'Intermédiaire', 6], [70, 'Expert', 7], [89, 'Expert', 7], [90, 'Maître', 8], [100, 'Maître', 8]]) {
  sheet.skills[skillIndex('Marchandage')].score = String(score);
  elements['verbal-refresh'].fire('click');
  assert.equal(elements['verbal-level'].textContent,
    `Marchandage : Rang : ${rank} · ${count}/5 mots à conserver · ${count - 5} joker(s).`);
  elements['verbal-roll'].fire('click');
  assert.equal(elements['verbal-words'].children.length, count);
}

// A high persuasion score cannot supply a missing score for another skill.
sheet.skills[skillIndex('Intimidation/Persuasion')].score = 100;
for (const score of ['', null, undefined, 'invalid', -1]) {
  sheet.skills[skillIndex('Représentation')].score = score;
  select('Séduire');
  assert.equal(elements['verbal-roll'].disabled, true);
  assert.equal(elements['verbal-experience'].disabled, true);
  assert.match(elements['verbal-level'].textContent, /^Représentation : score indisponible/);
  const before = marked.length;
  elements['verbal-roll'].fire('click');
  elements['verbal-experience'].fire('click');
  assert.equal(elements['verbal-words'].children.length, 0);
  assert.equal(marked.length, before);
}
delete elements['character-sheet-frame'];
select('Négocier');
assert.match(elements['verbal-level'].textContent, /^Marchandage : Rang : Maître/,
  'The local draft also uses the selected skill');
assert.equal(elements['verbal-roll'].disabled, false);
// Le brouillon historique ne doit jamais fournir le nom d'un autre PJ en V2.
stored.set('dice-forge.pj-markdown.v1', { ...sheet, fields: { name: 'test3' } });
draftKey = 'dice-forge.pj-markdown.v2:owner:4SSU:ilya';
stored.set(draftKey, { ...sheet, fields: { name: 'Ilya' } });
storageListeners.storage({key:draftKey});
elements['verbal-roll'].fire('click');
assert.equal(obsUpdates.at(-1).payload.character, 'Ilya');
assert.equal(obsUpdates.at(-1).newDraw, true);
elements['character-sheet-frame'] = { contentWindow: {
  location: {href:'http://127.0.0.1:5000/dice/pj.html?context=ancien-pj'},
  diceForgeSheet: {getData:()=>stored.get('dice-forge.pj-markdown.v1')}
}};
elements['verbal-roll'].fire('click');
assert.equal(obsUpdates.at(-1).payload.character, 'Ilya', 'Une iframe d’un ancien PJ ne remplace pas le brouillon sélectionné');
draftKey = 'dice-forge.pj-markdown.v2:owner:4SSU:autre';
stored.set(draftKey, { ...sheet, fields: {name:'Autre PJ'} });
storageListeners.storage({key:'diceforge_character:owner:4SSU'});
elements['verbal-roll'].fire('click');
assert.equal(obsUpdates.at(-1).payload.character, 'Autre PJ');
console.log('OK : huit approches, compétences, jokers, expérience et identité OBS du PJ sélectionné, sans réutiliser un ancien brouillon.');
