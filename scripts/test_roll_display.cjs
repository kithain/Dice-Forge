const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
(async () => {
  const { compactRoll } = await import(`data:text/javascript;base64,${fs.readFileSync('js/roll-display.js').toString('base64')}`);
  const row = { expression: 'Escalade 40% · Moyen ×1 · malus −20 (20%)', rolls_detail: '[15] Réussite', total: 15, is_fail: false };
  assert.deepEqual(compactRoll(row), { expression: 'Escalade (20 %)', total: '15', marker: ' ✓' });
  assert.equal(compactRoll({ ...row, is_fail: true }).marker, ' ✗');
  assert.equal(compactRoll({ ...row, is_crit: true }).marker, ' <!> ✓');
  assert.equal(compactRoll({ ...row, expression: 'Estimation 15% · Moyen ×1 · malus −20 (0%)', rolls_detail: '[AUTO] Échec automatique' }).total, '—');
  assert.equal(compactRoll({ expression: '2D6 + 5' }), null);
  const obs=fs.readFileSync('js/obs-dice.js','utf8');
  const parser=obs.slice(obs.indexOf('function groupsFromRoll('),obs.indexOf('function enqueueGroups('));
  const obsContext={};vm.createContext(obsContext);vm.runInContext(parser,obsContext);
  for(const total of [80,100]) {
    const groups=obsContext.groupsFromRoll({expression:'Progression · Estimation · D100 > 50',rolls_detail:`D100 ${total} / score 50 %`,total});
    assert.equal(groups[0].type,100);assert.equal(groups[0].rolls[0].finalVal,total,'OBS animates the same authoritative progression die');
  }
  assert.equal(obsContext.groupsFromRoll({expression:'Progression · Test · D100 > 50',total:101}).length,0);
  const source = fs.readFileSync('js/app.js', 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('function renderResult()');
  const end = source.indexOf('\n}\n', start) + 2;
  const element = {};
  const context = { document: { getElementById: () => element }, escapeAttribute: value => value,
    formatPercentile: value => String(value).padStart(2, '0'),
    results: { groups: [], total: 15, mod: 0, characterTest: { kind: 'brp', skill: { name: 'Escalade', checked: true }, rollLabel: '15', level: 'success', label: 'Réussite', criticalLimit: 1, specialLimit: 4, fumbleMin: 96 } } };
  vm.createContext(context); vm.runInContext(fs.readFileSync('js/dice-stage.js','utf8').replace(/export /g,'')+'\n'+source.slice(start, end) + '\nrenderResult();', context);
  assert.match(element.innerHTML, /total-lbl">Escalade/);
  assert.match(element.innerHTML, /total-num[^>]*>15/);
  assert.ok(element.innerHTML.indexOf('test-msg') < element.innerHTML.indexOf('test-thresholds'));
  assert.doesNotMatch(element.innerHTML, /Résultat D100|cochée pour|Moyen|malus/);
  console.log('Compact BRP result and room feed passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
