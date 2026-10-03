const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
  const { inventoryJournal } = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('js/inventory-sync.js', 'utf8')).toString('base64'));
  const source = fs.readFileSync('js/inventory-sheet.js', 'utf8');
  const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
  const code = section('function inventorySnapshot(', 'function emptyInventory(')
    + section('function cloudPayload(', 'function inventoryFromCloud(')
    + section('async function loadCloud(', 'async function reloadIdentity(');
  const memory = new Map();
  const row = { characterName: 'A', wallet: { po: 1, pa: 0, pc: 0 }, weapons: [], armors: [], equipment: [{ name: 'Sac' }],
    consumables: [], miscellaneous: [], potions: [], potionContainer: {}, revision: 3 };
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  let cloud = structuredClone(row), reads = 0, writes = 0;
  const context = {
    window: { SUPABASE_CONFIG: { characterV2: false } },
    structuredClone, inventoryJournal, console, clearTimeout, saveTimer: null,
    cloudLoadInProgress: false, roomIdentity: { code: 'TEST', userId: 'owner', player: 'Player' },
    journals: new Map(), lastRecorded: null,
    inventory: { ...structuredClone(row), equipment: [] },
    localStorage: { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) },
    storageKey: () => 'inventory:owner:TEST',
    document: { getElementById: () => ({ disabled: false }) },
    collectFromDom() {}, saveLocal() {}, enrichInventoryFromCatalog() {}, render() {},
    inventoryFromCloud: value => structuredClone(value), normalizeInventory: value => value,
    inventoryError: error => error.message, consumablesWithPotions: values => values,
    importFromCompleteSheet: () => { throw Error('Unexpected import'); },
    setStatus(message) { context.status = message; },
    supabase: { from() {
      return {
        select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
        async maybeSingle() { if (++reads === 1) await waiting; return { data: structuredClone(cloud), error: null }; },
        upsert(payload) {
          assert.equal(payload.expected_revision, cloud.revision);
          cloud = { ...structuredClone(row), characterName: payload.character_name, wallet: { po: payload.po, pa: payload.pa, pc: payload.pc },
            equipment: payload.equipment, revision: cloud.revision + 1 };
          writes++;
          return { select: async () => ({ data: [structuredClone(cloud)], error: null }) };
        }
      };
    } }
  };
  vm.createContext(context); vm.runInContext(code, context);
  context.lastRecorded = context.inventorySnapshot(context.inventory);
  const loading = context.loadCloud();
  await Promise.resolve();
  context.inventory.wallet.po = 2;
  context.recordInventoryEdit();
  release(); await loading;
  assert.equal(context.inventory.wallet.po, 2, 'A change during loading stays on screen');
  assert.equal(cloud.wallet.po, 2, 'The change is also pushed to the cloud');
  assert.equal(cloud.equipment[0].name, 'Sac', 'Existing remote inventory is preserved');
  assert.equal(writes, 1);
  assert.equal(context.currentJournal().pending().length, 0);
  assert.equal(context.inventory.revision, 4);
  console.log('Inventaire : modification pendant le chargement conservée et envoyée, sans écraser le serveur.');
})().catch(error => { console.error(error); process.exitCode = 1; });
