const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('js/app.js', 'utf8').replace(/\r\n/g, '\n');
const names = ['brpThresholdFor', 'createPercentileTest', 'brpTestSummary', 'brpTestExpression'];
const context = {};
vm.createContext(context);
for (const name of names) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\n}\n', start) + 2;
  vm.runInContext(source.slice(start, end), context);
}
const normal = { label: 'Moyen ×1', multiplier: 1 };
assert.equal(context.brpThresholdFor(65, normal, 30), 35);
assert.equal(context.brpThresholdFor(65, { multiplier: 2 }, 30), 100);
assert.equal(context.brpThresholdFor(65, { divisor: 2 }, 10), 23);
assert.equal(context.brpThresholdFor(20, normal, 40), 0);
assert.equal(context.brpThresholdFor(65, { mode: 'auto-success' }, 40), 65);
assert.equal(context.brpThresholdFor(65, { mode: 'auto-failure' }, 40), 0);
const skill = { id: 'observation', name: 'Observation', score: 65 };
const test = context.createPercentileTest({ kind: 'brp', score: 65, threshold: 35, difficulty: normal, skill, malus: 30 });
assert.equal(test.skill.id, skill.id);
assert.equal(skill.score, 65);
assert.match(context.brpTestSummary(test), /malus −30.*35%/);
assert.match(context.brpTestExpression(test), /malus −30.*35%/);
assert.doesNotMatch(context.brpTestExpression({ ...test, malus: 0 }), /malus/);
console.log('BRP malus: difficulty, bounds, automatic results, skill identity and roll messages passed.');
