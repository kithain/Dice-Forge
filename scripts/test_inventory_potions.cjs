const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function moduleFromFile(name) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

(async () => {
  const { ALCHEMY_POTIONS } = await moduleFromFile('alchemy-potions.js');
  const { potionRowsFromInventory, regularConsumables, consumablesWithPotions, normalizePotionRows, availablePotionCapacity, doseCount } = await moduleFromFile('inventory-potions.js');
  assert.equal(ALCHEMY_POTIONS.length, 16);
  assert.equal(new Set(ALCHEMY_POTIONS.map(row => row.name)).size, 16);
  assert(ALCHEMY_POTIONS.every(row => row.effect && row.backlash));
  for (const name of ['Sang de berserker', 'Œil de Lyncée', 'Cuirasse de titan', 'Souffle de djinn']) {
    const potion = ALCHEMY_POTIONS.find(row => row.name === name);
    assert.match(potion.backlash, /Réussite/);
    assert.match(potion.backlash, /Échec/);
  }
  const legacy = { consumables: [{ name: 'Rations', description: 'Trois jours' }] };
  assert.deepEqual(potionRowsFromInventory(legacy, ALCHEMY_POTIONS), [], 'Un nouvel inventaire commence vide');
  assert.deepEqual(potionRowsFromInventory({ potions: ALCHEMY_POTIONS }, ALCHEMY_POTIONS), [], 'L’ancien répertoire intégral est retiré');
  const owned = [{ ...ALCHEMY_POTIONS[0], carried: 3, stock: 8 }, { ...ALCHEMY_POTIONS[1], carried: 1, stock: 2 }];
  owned[0].effect = 'Effet personnalisé\nSeconde ligne';
  assert.notEqual(owned[0].effect, ALCHEMY_POTIONS[0].effect, 'Le catalogue reste intact');
  const payload = consumablesWithPotions(legacy.consumables, owned);
  const saved = JSON.parse(JSON.stringify({ consumables: payload }));
  assert.deepEqual(potionRowsFromInventory(saved, ALCHEMY_POTIONS), owned);
  assert.deepEqual(regularConsumables(saved.consumables), legacy.consumables);
  assert.deepEqual(potionRowsFromInventory({ potions: owned }, ALCHEMY_POTIONS), owned);
  const cleared = { consumables: consumablesWithPotions(legacy.consumables, []) };
  assert.deepEqual(potionRowsFromInventory(cleared, ALCHEMY_POTIONS), [], 'Une liste vidée ne se réinitialise pas');
  assert.deepEqual(regularConsumables(cleared.consumables), legacy.consumables);
  assert.deepEqual(potionRowsFromInventory({ potions: [] }, ALCHEMY_POTIONS), []);
  const malformed = { consumables: null, potions: null };
  assert.deepEqual(potionRowsFromInventory(malformed, ALCHEMY_POTIONS), []);
  assert.equal(availablePotionCapacity(owned, 0), 3);
  assert.equal(availablePotionCapacity(owned, 1), 1);
  assert.equal(availablePotionCapacity(owned, 2), 0, 'La limite porte sur toutes les potions');
  const overflow = normalizePotionRows([{ name: 'A', carried: 3, stock: 5 }, { name: 'B', carried: 4, stock: 2 }]);
  assert.equal(overflow.reduce((sum, row) => sum + row.carried, 0), 4);
  assert.equal(overflow[1].stock, 5, 'Les doses excédentaires restent dans le stock');
  assert.equal(overflow.reduce((sum, row) => sum + row.carried + row.stock, 0), 14, 'Aucune dose perdue');
  assert.equal(doseCount(-3), 0);
  assert.equal(doseCount(2.9), 2);
  assert.equal(doseCount('abc'), 0);
  assert.equal(doseCount(Infinity), 0);
  assert.deepEqual(potionRowsFromInventory({ potions: [ALCHEMY_POTIONS[0]] }, ALCHEMY_POTIONS), [{ ...ALCHEMY_POTIONS[0], carried: 0, stock: 0 }], 'Les anciennes lignes personnalisées sont conservées');
  console.log('Potions : inventaire vide, 16 recettes, limite de 4 doses, stock et sauvegardes validés.');
})().catch(error => { console.error(error); process.exitCode = 1; });
