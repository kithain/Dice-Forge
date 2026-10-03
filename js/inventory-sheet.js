import { inventoryJournal } from './inventory-sync.js?v=20261003-save-fixes';
import { fillWealthOptions } from './creation-help.js?v=20261003-recipe-ui';
import { showConfirm } from './toast.js?v=20261002-safe-confirm';
import { getSupabaseClient } from './supabase-client.js?v=20261003-roster';
import { ALCHEMY_POTIONS } from './alchemy-potions.js?v=20261002-potion-doses';
import { potionRowsFromInventory, regularConsumables, consumablesWithPotions, normalizePotionRows, doseCount, availablePotionCapacity, MAX_CARRIED_DOSES } from './inventory-potions.js?v=20261002-campaign-v2-r1';

if (new URLSearchParams(location.search).get('embedded') === '1' && window.frameElement) {
  document.body.classList.add('inventory-embedded');
  const page = document.querySelector('.inventory-page');
  new ResizeObserver(() => {
    const height = Math.ceil(page.getBoundingClientRect().bottom + window.scrollY);
    if (height > 0) window.frameElement.style.height = `${height + 2}px`;
  }).observe(page);
}

const ROOM_STORAGE_KEY = 'diceforge_room';
const LEGACY_WALLET_KEY = 'dice-forge.wallet.v1';
const INVENTORY_STORAGE_PREFIX = 'dice-forge.inventory.v1';
const MAX_PO = 9999;
const MAX_TOTAL_PC = MAX_PO * 100 + 99;
const MIXED_WEAPONS = new Set(['Dague', 'Hachette', 'Lance', 'Javelot']);
const supabase = getSupabaseClient({ optional: true });

const SECTION_FIELDS = {
  weapons: ['name', 'description', 'category', 'brp', 'damage', 'hands', 'specials'],
  armors: ['name', 'description', 'type', 'protection', 'mobility', 'stealth', 'specials'],
  equipment: ['name', 'description'],
  consumables: ['name', 'description'],
  miscellaneous: ['name', 'description'],
  potions: ['name', 'carried', 'stock', 'effect', 'backlash']
};

let inventory = emptyInventory();
let saveTimer = null;
let cloudLoadInProgress = false;
let roomIdentity = identityFromStorage();
let equipmentCatalog = { weapons: [], armors: [], potions: ALCHEMY_POTIONS };
let weaponSkillScores = { contact: '', distance: '' };
const journals = new Map();
let lastRecorded = null;

function inventorySnapshot(value) {
  const { entries, type, ...potionContainer } = value.potionContainer || {};
  return { characterName: value.characterName || '', wallet: { ...value.wallet },
    ...Object.fromEntries(['weapons','armors','equipment','consumables','miscellaneous','potions']
      .map(section => [section, structuredClone(value[section] || [])])),
    potionContainer: structuredClone(potionContainer) };
}

function currentJournal() {
  const key = `${storageKey()}:history`;
  if (!journals.has(key)) journals.set(key, inventoryJournal(localStorage, key));
  return journals.get(key);
}

function recordInventoryEdit() {
  collectFromDom();
  const next = inventorySnapshot(inventory);
  currentJournal().record(lastRecorded || next, next);
  lastRecorded = next;
  saveLocal({ collect: false });
}


function emptyInventory() {
  return {
    characterName: '',
    wallet: { po: 0, pa: 0, pc: 0 },
    weapons: [],
    armors: [],
    equipment: [],
    consumables: [],
    miscellaneous: [],
    potions: []
  };
}

function identityFromStorage() {
  try {
    const room = JSON.parse(localStorage.getItem(ROOM_STORAGE_KEY));
    return room?.code && room?.player && room?.userId
      ? { code: String(room.code).toUpperCase(), player: String(room.player), userId: String(room.userId), characterId: window.SUPABASE_CONFIG?.characterV2 ? localStorage.getItem(`diceforge_character:${room.userId}:${room.code}`) : null }
      : null;
  } catch (error) {
    return null;
  }
}

function storageKey() {
  return roomIdentity
    ? `${INVENTORY_STORAGE_PREFIX}:${roomIdentity.userId}:${roomIdentity.code}${roomIdentity.characterId ? ':' + roomIdentity.characterId : ''}`
    : `${INVENTORY_STORAGE_PREFIX}:local`;
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function safeRows(value, fields) {
  if (!Array.isArray(value)) return [];
  return value.map(row => ({ ...row, ...Object.fromEntries(fields.map(field => [field, cleanText(row?.[field])])) }))
    .filter(row => Object.values(row).some(Boolean));
}

function normalizeInventory(value) {
  const source = value && typeof value === 'object' ? value : {};
  const rawWallet = source.wallet || source;
  const totalPc = (Math.max(0, Number.parseInt(rawWallet.po, 10) || 0) * 100)
    + (Math.max(0, Number.parseInt(rawWallet.pa, 10) || 0) * 10)
    + Math.max(0, Number.parseInt(rawWallet.pc, 10) || 0);
  return {
    ...source,
    characterName: cleanText(source.characterName || source.character_name),
    wallet: walletFromTotal(totalPc),
    weapons: safeRows(source.weapons, SECTION_FIELDS.weapons),
    armors: safeRows(source.armors, SECTION_FIELDS.armors),
    equipment: safeRows(source.equipment, SECTION_FIELDS.equipment),
    consumables: safeRows(regularConsumables(source.consumables), SECTION_FIELDS.consumables),
    potionContainer: source.potionContainer || source.consumables?.find(row => row.type === 'alchemy-potions') || {},
    miscellaneous: safeRows(source.miscellaneous, SECTION_FIELDS.miscellaneous),
    potions: potionRowsFromInventory(source, ALCHEMY_POTIONS)
  };
}

function walletFromTotal(totalPc) {
  const total = Math.max(0, Math.min(MAX_TOTAL_PC, Math.trunc(totalPc) || 0));
  return {
    po: Math.floor(total / 100),
    pa: Math.floor((total % 100) / 10),
    pc: total % 10
  };
}

function walletTotalPc() {
  return inventory.wallet.po * 100 + inventory.wallet.pa * 10 + inventory.wallet.pc;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function setStatus(message, type = '') {
  const status = document.getElementById('inventory-status');
  status.textContent = message;
  status.className = `inventory-status${type ? ` ${type}` : ''}`;
}

function rowMarkup(section, row, index) {
  const list = section === 'weapons' ? ' list="weapon-catalog-list"' : section === 'armors' ? ' list="armor-catalog-list"' : section === 'potions' ? ' list="potion-catalog-list"' : '';
  const input = (field, label, multiline = false) => multiline
    ? `<textarea data-row-field="${field}" aria-label="${label}">${escapeHtml(row[field])}</textarea>`
    : section === 'armors' && field === 'name'
      ? `<select data-row-field="name" aria-label="${label}"><option value="">Choisir une armure…</option>${[...new Set([row.name, ...equipmentCatalog.armors.map(item => item.name)].filter(Boolean))].map(name => `<option value="${escapeHtml(name)}"${name === row.name ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select>`
      : `<input data-row-field="${field}" value="${escapeHtml(row[field])}" aria-label="${label}"${field === 'name' ? list : ''}>`;
  const doses = (field, label) => `<input type="number" min="0" step="1"${field === 'carried' ? ` max="${MAX_CARRIED_DOSES}"` : ''} data-row-field="${field}" value="${doseCount(row[field])}" aria-label="${label}">`;
  const cells = section === 'weapons'
    ? `${input('name', 'Nom de l’arme')}${input('description', 'Description de l’arme', true)}${input('category', 'Catégorie de l’arme')}${input('brp', 'Pourcentage BRP')}${input('damage', 'Dégâts')}${input('hands', 'Nombre de mains')}${input('specials', 'Spécial de l’arme', true)}`
    : section === 'armors'
      ? `${input('name', 'Nom de l’armure')}${input('description', 'Description de l’armure', true)}${input('type', 'Type d’armure')}${input('protection', 'Protection')}${input('mobility', 'Mobilité')}${input('stealth', 'Discrétion')}${input('specials', 'Spécial de l’armure', true)}`
      : section === 'potions'
        ? `${input('name', 'Nom de la potion')}${doses('carried', 'Doses dans l’inventaire')}${doses('stock', 'Doses en stock')}${input('effect', 'Effet de la potion', true)}${input('backlash', 'Contrecoup de la potion', true)}`
        : `${input('name', 'Nom de l’objet')}${input('description', 'Description de l’objet', true)}`;
  return `<tr data-section="${section}" data-row-index="${index}">
    ${cells.split(/(?=<(?:input|textarea))/).filter(Boolean).map(cell => `<td>${cell}</td>`).join('')}
    <td><button class="inventory-remove" type="button" data-remove-row="${section}" data-row-index="${index}" aria-label="Supprimer cette ligne" title="Supprimer cette ligne">×</button></td>
  </tr>`;
}

function tableRows(documentRoot, selector) {
  return Array.from(documentRoot.querySelectorAll(`${selector} tbody tr`))
    .map(row => Array.from(row.cells).map(cell => cleanText(cell.textContent)));
}

function weaponScore(attackType) {
  if (attackType === 'mixed') {
    const contact = weaponSkillScores.contact || '—';
    const distance = weaponSkillScores.distance || '—';
    return `Contact ${contact} / Jet ${distance}`;
  }
  if (attackType === 'distance') return weaponSkillScores.distance || 'Jet';
  return weaponSkillScores.contact || 'Contact';
}

async function loadEquipmentCatalog() {
  try {
    const response = await fetch('inventaire.html');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const source = new DOMParser().parseFromString(await response.text(), 'text/html');
    const melee = tableRows(source, '#armes-melee').map(cells => ({
      name: cells[0],
      description: `${cells[1]} Prix : ${cells[6]}.`,
      category: cells[2],
      damage: cells[3],
      hands: cells[4],
      specials: cells[5],
      attackType: MIXED_WEAPONS.has(cells[0]) ? 'mixed' : 'contact'
    }));
    const distance = tableRows(source, '#armes-distance').map(cells => ({
      name: cells[0],
      description: `${cells[1]} Portée : ${cells[3]}. Prix : ${cells[6]}.`,
      category: 'Distance',
      damage: cells[2],
      hands: cells[4],
      specials: cells[5],
      attackType: MIXED_WEAPONS.has(cells[0]) ? 'mixed' : 'distance'
    }));
    const armors = tableRows(source, '#armures').map(cells => ({
      name: cells[0],
      description: `${cells[1]} Prix : ${cells[6]}.`,
      type: cells[2],
      protection: `${cells[3]} PA`,
      mobility: cells[4],
      stealth: cells[5],
      specials: ''
    }));
    const shields = tableRows(source, '#boucliers-protections').map(cells => ({
      name: cells[0],
      description: `${cells[1]} Prix : ${cells[4]}.`,
      type: 'Bouclier / protection',
      protection: cells[2],
      mobility: '',
      stealth: '',
      specials: cells[3]
    }));
    equipmentCatalog = { weapons: [...melee, ...distance], armors: [...armors, ...shields], potions: ALCHEMY_POTIONS };
    document.getElementById('weapon-catalog-list').innerHTML = equipmentCatalog.weapons
      .map(item => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.damage)}</option>`).join('');
    document.getElementById('armor-catalog-list').innerHTML = equipmentCatalog.armors
      .map(item => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.protection)}</option>`).join('');
  } catch (error) {
    console.warn('Catalogue inventaire indisponible', error);
  }
}

function findCatalogEntry(section, name) {
  const normalized = cleanText(name).toLocaleLowerCase('fr-FR');
  return equipmentCatalog[section].find(item => item.name.toLocaleLowerCase('fr-FR') === normalized);
}

function applyCatalogSelection(input) {
  const row = input.closest('tr');
  const section = row?.dataset.section;
  if (!row || !['weapons', 'armors', 'potions'].includes(section)) return false;
  const entry = findCatalogEntry(section, input.value);
  if (!entry) return false;
  if (section === 'potions') {
    row.querySelector('[data-row-field="effect"]').value = entry.effect;
    row.querySelector('[data-row-field="backlash"]').value = entry.backlash;
    resizePotionFields();
    return true;
  }
  row.querySelector('[data-row-field="description"]').value = entry.description;
  if (section === 'weapons') {
    row.querySelector('[data-row-field="category"]').value = entry.category;
    row.querySelector('[data-row-field="brp"]').value = weaponScore(entry.attackType);
    row.querySelector('[data-row-field="damage"]').value = entry.damage;
    row.querySelector('[data-row-field="hands"]').value = entry.hands;
    row.querySelector('[data-row-field="specials"]').value = entry.specials;
  } else {
    row.querySelector('[data-row-field="type"]').value = entry.type;
    row.querySelector('[data-row-field="protection"]').value = entry.protection;
    row.querySelector('[data-row-field="mobility"]').value = entry.mobility;
    row.querySelector('[data-row-field="stealth"]').value = entry.stealth;
    row.querySelector('[data-row-field="specials"]').value = entry.specials;
  }
  return true;
}

function enrichInventoryFromCatalog() {
  inventory.weapons.forEach(weapon => {
    const entry = findCatalogEntry('weapons', weapon.name);
    if (!entry) return;
    weapon.category ||= entry.category;
    weapon.hands ||= entry.hands;
    weapon.specials ||= entry.specials;
  });
  inventory.armors.forEach(armor => {
    const entry = findCatalogEntry('armors', armor.name);
    if (!entry) return;
    armor.type ||= entry.type;
    armor.mobility ||= entry.mobility;
    armor.stealth ||= entry.stealth;
    armor.specials ||= entry.specials;
  });
}

async function loadWeaponSkillScores() {
  if (!supabase || !roomIdentity) return;
  const { data } = await supabase.from('pj_sheets')
    .select('sheet_data')
    .eq('user_id', roomIdentity.userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const skills = data?.sheet_data?.skills;
  if (!Array.isArray(skills)) return;
  weaponSkillScores = {
    contact: cleanText(skills[32]?.score),
    distance: cleanText(skills[33]?.score)
  };
}

function renderSection(section) {
  const body = document.getElementById(`inventory-${section}`);
  body.innerHTML = inventory[section].map((row, index) => section === 'miscellaneous' && row.name === 'Classe sociale' ? '' : rowMarkup(section, row, index)).join('');
  if (section === 'potions') {
    resizePotionFields();
    updatePotionCapacity();
  }
}

function updatePotionCapacity(message = '') {
  const rows = collectRowsFromDom('potions');
  const total = rows.reduce((sum, row) => sum + doseCount(row.carried), 0);
  document.getElementById('inventory-potion-capacity').textContent = `Inventaire : ${total} / ${MAX_CARRIED_DOSES} doses${message ? ` — ${message}` : ''}`;
  document.getElementById('inventory-potions-empty').hidden = rows.length > 0;
  document.querySelectorAll('#inventory-potions [data-row-field="carried"]').forEach((input, index) => {
    input.max = availablePotionCapacity(rows, index);
  });
}

function potionDoseChanged(input) {
  const field = input.dataset.rowField;
  if (!['carried', 'stock'].includes(field)) return;
  const index = Number(input.closest('tr').dataset.rowIndex);
  const requested = doseCount(input.value);
  const allowed = field === 'carried' ? availablePotionCapacity(collectRowsFromDom('potions'), index) : requested;
  input.value = Math.min(requested, allowed);
  updatePotionCapacity(requested > allowed ? 'Limite de 4 doses transportées atteinte. Les réserves vont dans « Stock ».' : '');
}

function resizePotionFields() {
  document.querySelectorAll('#inventory-potions textarea').forEach(input => {
    input.style.height = 'auto';
    if (input.scrollHeight) input.style.height = `${input.scrollHeight + 2}px`;
  });
}

function renderWallet() {
  for (const unit of ['po', 'pa', 'pc']) {
    const input = document.getElementById(`inventory-${unit}`);
    if (input) input.value = inventory.wallet[unit];
  }
  const total = walletTotalPc();
  document.querySelectorAll('[data-money-unit]').forEach(button => {
    const unitValue = { po: 100, pa: 10, pc: 1 }[button.dataset.moneyUnit];
    const delta = Number(button.dataset.moneyDelta);
    button.disabled = delta < 0 ? total < unitValue : total >= MAX_TOTAL_PC;
  });
}

function render() {
  fillWealthOptions(document.getElementById('inventory-social-class'), inventory.miscellaneous.find(row => row.name === 'Classe sociale')?.description || 'Moyen');
  const character = inventory.characterName || roomIdentity?.player || 'Personnage';
  document.getElementById('inventory-character').textContent = roomIdentity
    ? `${character} · ${roomIdentity.player} · salon ${roomIdentity.code}`
    : 'Mode local · rejoignez une partie pour sauvegarder cet inventaire sur Supabase.';
  renderWallet();
  Object.keys(SECTION_FIELDS).forEach(renderSection);
}

function collectRowsFromDom(section) {
  return Array.from(document.querySelectorAll(`tr[data-section="${section}"]`)).map(row =>
    ({ ...inventory[section]?.[Number(row.dataset.rowIndex)],
      ...Object.fromEntries(Array.from(row.querySelectorAll('[data-row-field]')).map(input => [input.dataset.rowField, cleanText(input.value)])) })
  );
}

function collectFromDom() {
  Object.keys(SECTION_FIELDS).forEach(section => {
    inventory[section] = collectRowsFromDom(section);
  });
  inventory.potions = normalizePotionRows(inventory.potions);
  inventory.miscellaneous.push({ name: 'Classe sociale', description: document.getElementById('inventory-social-class').value });
  return inventory;
}

function saveLocal({ collect = true } = {}) {
  if (collect) collectFromDom();
  localStorage.setItem(storageKey(), JSON.stringify(inventory));
}

function scheduleSave() {
  try { recordInventoryEdit(); }
  catch (error) { setStatus(`Historique non enregistré : ${error.message}`, 'error'); return; }
  setStatus(roomIdentity ? 'Modifications en attente de sauvegarde…' : 'Inventaire enregistré localement.');
  clearTimeout(saveTimer);
  if (roomIdentity && supabase) {
    saveTimer = setTimeout(() => saveCloud({ automatic: true }), 700);
  }
}

function addRow(section, value = {}) {
  collectFromDom();
  inventory[section].push({ id: crypto.randomUUID(), ...Object.fromEntries(SECTION_FIELDS[section].map(field => [field, cleanText(value[field])])) });
  renderSection(section);
  saveLocal();
  document.querySelector(`#inventory-${section} tr:last-child [data-row-field]`)?.focus();
  scheduleSave();
}

function removeRow(section, index) {
  collectFromDom();
  inventory[section].splice(index, 1);
  renderSection(section);
  scheduleSave();
}

function changeMoney(unit, delta) {
  const unitValue = { po: 100, pa: 10, pc: 1 }[unit];
  if (!unitValue || !Number.isInteger(delta)) return;
  inventory.wallet = walletFromTotal(walletTotalPc() + unitValue * delta);
  renderWallet();
  scheduleSave();
}

function moneyInputChanged(unit) {
  const raw = Math.max(0, Number.parseInt(document.getElementById(`inventory-${unit}`)?.value, 10) || 0);
  const values = { ...inventory.wallet, [unit]: raw };
  inventory.wallet = walletFromTotal(values.po * 100 + values.pa * 10 + values.pc);
  renderWallet();
  scheduleSave();
}

function inventoryError(error) {
  if (error?.code === '42P01' || /relation .*pj_inventory.* does not exist/i.test(error?.message || '')) {
    return 'Table pj_inventory absente : exécutez supabase-inventory.sql dans Supabase.';
  }
  return error?.message || 'Erreur Supabase inconnue';
}

function cloudPayload(value = inventory, identity = roomIdentity) {
  return {
    user_id: identity.userId,
    ...(identity.characterId ? { __character_id: identity.characterId } : {}),
    ...(value.revision ? { expected_revision: value.revision } : {}),
    room_code: identity.code,
    player_name: identity.player,
    character_name: value.characterName,
    po: value.wallet.po, pa: value.wallet.pa, pc: value.wallet.pc,
    weapons: value.weapons, armors: value.armors, equipment: value.equipment,
    consumables: consumablesWithPotions(value.consumables, value.potions, value.potionContainer),
    miscellaneous: value.miscellaneous, updated_at: new Date().toISOString()
  };
}

async function readCloudInventory(identity) {
  const { data, error } = await supabase.from('pj_inventory').select('*')
    .eq('user_id', identity.userId).eq('room_code', identity.code)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function saveCloud({ automatic = false } = {}) {
  clearTimeout(saveTimer);
  if (!supabase || !roomIdentity) {
    if (!automatic) setStatus(!supabase ? 'Supabase n’est pas configuré.' : 'Rejoignez d’abord une partie.', 'error');
    return false;
  }
  // The loader replays edits and resumes the FIFO once its baseline is known.
  if (cloudLoadInProgress) return false;
  const identity = { ...roomIdentity };
  const key = storageKey();
  const button = document.getElementById('inventory-save');
  try {
    recordInventoryEdit();
    const journal = currentJournal();
    button.disabled = true;
    await journal.flush(async () => {
      const row = await readCloudInventory(identity);
      const value = row ? inventoryFromCloud(row) : await importFromCompleteSheet(identity);
      return { data: inventorySnapshot(value), revision: row?.revision };
    }, async (data, latest) => {
      const { data: saved, error } = await supabase.from('pj_inventory')
        .upsert(cloudPayload({ ...data, revision: latest.revision }, identity), { onConflict: 'room_code,player_name' }).select('*');
      if (error) throw error;
      return saved?.[0];
    }, saved => {
      if (storageKey() === key && saved?.revision) inventory.revision = saved.revision;
    });
    if (storageKey() !== key) return true;
    saveLocal();
    document.getElementById('inventory-resolve').hidden = true;
    setStatus(`Inventaire sauvegardé dans le salon ${identity.code}. Historique local conservé.`, 'success');
    return true;
  } catch (error) {
    if (storageKey() === key) {
      document.getElementById('inventory-resolve').hidden = error.code !== 'DF_INVENTORY_CONFLICT';
      setStatus(`Envoi en attente : ${inventoryError(error)}. Les modifications restent locales.`, 'error');
    }
    return false;
  } finally {
    if (storageKey() === key) button.disabled = false;
  }
}

function inventoryFromCloud(row) {
  return normalizeInventory({
    ...row,
    characterName: row.character_name,
    wallet: { po: row.po, pa: row.pa, pc: row.pc },
    weapons: row.weapons,
    armors: row.armors,
    equipment: row.equipment,
    consumables: row.consumables,
    miscellaneous: row.miscellaneous
  });
}

function brpWeaponScore(weapon) {
  if (weapon.attackType === 'mixed') return `Contact ${weapon.contactScore || 0} / Jet ${weapon.distanceScore || 0}`;
  if (weapon.attackType === 'distance') return weapon.distanceScore || '';
  return weapon.contactScore || '';
}

function importLegacyWallet() {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_WALLET_KEY)) || {};
  } catch (error) {
    return {};
  }
}

async function importFromCompleteSheet(identity = roomIdentity) {
  const migrated = emptyInventory();
  migrated.wallet = normalizeInventory({ wallet: importLegacyWallet() }).wallet;
  if (!supabase || !identity) return migrated;
  const { data, error } = await supabase.from('pj_sheets')
    .select('character_name,sheet_data')
    .eq('user_id', identity.userId).eq('room_code', identity.code)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.sheet_data) return migrated;

  const sheet = data.sheet_data;
  const wealth = cleanText(sheet.fields?.wealth || sheet.fields?.richesse);
  if (wealth) migrated.miscellaneous.push({ name: 'Classe sociale', description: wealth });
  migrated.characterName = cleanText(data.character_name || sheet.fields?.name);
  migrated.weapons = safeRows((sheet.weapons || []).map(weapon => {
    const catalog = findCatalogEntry('weapons', weapon.name);
    return {
      name: weapon.name,
      description: catalog?.description || (weapon.attackType ? `Classe : ${weapon.attackType}` : ''),
      category: catalog?.category || '',
      brp: brpWeaponScore(weapon),
      damage: weapon.damage || catalog?.damage,
      hands: catalog?.hands || '',
      specials: catalog?.specials || ''
    };
  }), SECTION_FIELDS.weapons);
  if (sheet.fields?.armorType || sheet.fields?.armorPoints) {
    const catalog = findCatalogEntry('armors', sheet.fields.armorType);
    migrated.armors = [{
      name: cleanText(sheet.fields.armorType),
      description: catalog?.description || '',
      type: catalog?.type || '',
      protection: cleanText(sheet.fields.armorPoints) || catalog?.protection || '',
      mobility: catalog?.mobility || '',
      stealth: catalog?.stealth || '',
      specials: catalog?.specials || ''
    }];
  }
  migrated.equipment = cleanText(sheet.fields?.equipment).split(/\r?\n/).filter(Boolean)
    .map(name => ({ name: cleanText(name), description: '' }));
  return migrated;
}

async function loadCloud({ manual = false } = {}) {
  if (cloudLoadInProgress) return;
  if (!supabase || !roomIdentity) {
    if (manual) setStatus(!supabase ? 'Supabase n’est pas configuré.' : 'Rejoignez d’abord une partie.', 'error');
    return;
  }
  const identity = { ...roomIdentity };
  const key = storageKey();
  cloudLoadInProgress = true;
  document.getElementById('inventory-refresh').disabled = true;
  setStatus('Chargement de l’inventaire Supabase…');
  try {
    const journal = currentJournal();
    if (window.SUPABASE_CONFIG?.characterV2) {
      const sheet = await supabase.from('pj_sheets').select('sheet_data').eq('user_id',identity.userId).eq('room_code',identity.code).maybeSingle();
      if (sheet.error) throw sheet.error;
      if (sheet.data?.sheet_data?.state_id) {
        const migrated = await supabase.rpc('df_import_legacy_inventory',{p_state:sheet.data.sheet_data.state_id,p_room:identity.code});
        if (migrated.error) throw migrated.error;
      }
    }
    const row = await readCloudInventory(identity);
    const baseline = row ? inventoryFromCloud(row) : await importFromCompleteSheet(identity);
    if (storageKey() !== key) return;
    // Capture any edits made during the fetch, then replay them over the server.
    recordInventoryEdit();
    inventory = normalizeInventory({ ...baseline, ...journal.replay(inventorySnapshot(baseline)) });
    enrichInventoryFromCatalog();
    lastRecorded = inventorySnapshot(inventory);
    render();
    saveLocal({ collect: false });
    if (!row && !journal.pending().length) {
      // Queue initial import as well, with an explicit empty baseline.
      journal.record(inventorySnapshot(emptyInventory()), inventorySnapshot(inventory));
    }
    setStatus(journal.pending().length ? 'Inventaire chargé ; modifications locales conservées, envoi dans l’ordre…'
      : 'Inventaire chargé depuis Supabase.', 'success');
  } catch (error) {
    if (storageKey() === key) setStatus(`Chargement impossible : ${inventoryError(error)}`, 'error');
  } finally {
    cloudLoadInProgress = false;
    document.getElementById('inventory-refresh').disabled = false;
    if (storageKey() !== key) loadCloud();
  }
  if (storageKey() === key && currentJournal().pending().length) await saveCloud({ automatic: true });
}

async function reloadIdentity() {
  const nextIdentity = identityFromStorage();
  const changed = nextIdentity?.code !== roomIdentity?.code
    || nextIdentity?.player !== roomIdentity?.player
    || nextIdentity?.userId !== roomIdentity?.userId
    || nextIdentity?.characterId !== roomIdentity?.characterId;
  if (!changed) return;
  clearTimeout(saveTimer);
  roomIdentity = nextIdentity;
  document.getElementById('inventory-resolve').hidden = true;
  inventory = emptyInventory();
  try {
    inventory = normalizeInventory(JSON.parse(localStorage.getItem(storageKey())));
  } catch (error) {
    inventory = emptyInventory();
  }
  lastRecorded = inventorySnapshot(inventory);
  render();
  await loadCloud();
}

document.addEventListener('input', event => {
  const unit = event.target.id?.match(/^inventory-(po|pa|pc)$/)?.[1];
  if (unit) moneyInputChanged(unit);
  else if (event.target.matches('[data-row-field]')) {
    if (event.target.closest('#inventory-potions')) potionDoseChanged(event.target);
    if (event.target.dataset.rowField === 'name') applyCatalogSelection(event.target);
    if (event.target.closest('#inventory-potions')) resizePotionFields();
    scheduleSave();
  }
});
document.getElementById('inventory-social-class').addEventListener('change', scheduleSave);
document.addEventListener('click', event => {
  const add = event.target.closest('[data-add-row]');
  if (add) addRow(add.dataset.addRow);
  const remove = event.target.closest('[data-remove-row]');
  if (remove) removeRow(remove.dataset.removeRow, Number(remove.dataset.rowIndex));
  const money = event.target.closest('[data-money-unit]');
  if (money) changeMoney(money.dataset.moneyUnit, Number(money.dataset.moneyDelta));
});
document.getElementById('inventory-save').addEventListener('click', () => saveCloud());
document.getElementById('inventory-resolve').addEventListener('click', async () => {
  const key = storageKey();
  const identity = roomIdentity && { ...roomIdentity };
  if (!identity || !supabase) return;
  const confirmed = await showConfirm('Appliquer vos modifications locales malgré le conflit ? Les champs concernés remplaceront leurs valeurs actuelles sur le serveur. Les autres champs seront conservés. Vous pouvez exporter l’historique avant de continuer.', { confirmLabel: 'Appliquer mes modifications' });
  if (!confirmed || storageKey() !== key) return;
  try {
    const row = await readCloudInventory(identity);
    if (storageKey() !== key) return;
    recordInventoryEdit();
    currentJournal().rebase(inventorySnapshot(row ? inventoryFromCloud(row) : await importFromCompleteSheet(identity)));
    await saveCloud();
  } catch (error) { if (storageKey() === key) setStatus(`Résolution impossible : ${inventoryError(error)}`, 'error'); }
});
document.getElementById('inventory-history').addEventListener('click', () => {
  try {
    const blob = new Blob([JSON.stringify({ room: roomIdentity?.code || 'local', entries: currentJournal().history() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `inventaire-historique-${roomIdentity?.code || 'local'}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { setStatus(`Historique indisponible : ${error.message}`, 'error'); }
});
window.addEventListener('online', () => saveCloud({ automatic: true }));
document.getElementById('inventory-refresh').addEventListener('click', () => loadCloud({ manual: true }));
window.addEventListener('message', event => {
  if (event.origin === location.origin && event.data?.type === 'diceforge:inventory-refresh') reloadIdentity();
});
window.addEventListener('storage', event => {
  if (event.key === ROOM_STORAGE_KEY || event.key?.startsWith('diceforge_character:')) reloadIdentity();
});

try {
  inventory = normalizeInventory(JSON.parse(localStorage.getItem(storageKey())));
} catch (error) {
  inventory = emptyInventory();
}
lastRecorded = inventorySnapshot(inventory);
render();
document.getElementById('potion-catalog-list').innerHTML = ALCHEMY_POTIONS
  .map(item => `<option value="${escapeHtml(item.name)}"></option>`).join('');
const inventoryTabs = Array.from(document.querySelectorAll('.inventory-tabs [role="tab"]'));
function selectInventoryTab(tab) {
  inventoryTabs.forEach(button => {
    const selected = button === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
  });
  resizePotionFields();
}
inventoryTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectInventoryTab(tab));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? inventoryTabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + inventoryTabs.length) % inventoryTabs.length;
    selectInventoryTab(inventoryTabs[next]);
    inventoryTabs[next].focus();
  });
});
Promise.all([loadEquipmentCatalog(), loadWeaponSkillScores()]).then(() => {
  collectFromDom();
  enrichInventoryFromCatalog();
  render();
  saveLocal({ collect: false });
  loadCloud();
});
