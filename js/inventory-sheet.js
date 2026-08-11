import { getSupabaseClient } from './supabase-client.js';

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
  miscellaneous: ['name', 'description']
};

let inventory = emptyInventory();
let saveTimer = null;
let cloudLoadInProgress = false;
let roomIdentity = identityFromStorage();
let equipmentCatalog = { weapons: [], armors: [] };
let weaponSkillScores = { contact: '', distance: '' };

function emptyInventory() {
  return {
    characterName: '',
    wallet: { po: 0, pa: 0, pc: 0 },
    weapons: [],
    armors: [],
    equipment: [],
    consumables: [],
    miscellaneous: []
  };
}

function identityFromStorage() {
  try {
    const room = JSON.parse(localStorage.getItem(ROOM_STORAGE_KEY));
    return room?.code && room?.player && room?.userId
      ? { code: String(room.code).toUpperCase(), player: String(room.player), userId: String(room.userId) }
      : null;
  } catch (error) {
    return null;
  }
}

function storageKey() {
  return roomIdentity
    ? `${INVENTORY_STORAGE_PREFIX}:${roomIdentity.userId}`
    : `${INVENTORY_STORAGE_PREFIX}:local`;
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function safeRows(value, fields) {
  if (!Array.isArray(value)) return [];
  return value.map(row => Object.fromEntries(fields.map(field => [field, cleanText(row?.[field])])))
    .filter(row => Object.values(row).some(Boolean));
}

function normalizeInventory(value) {
  const source = value && typeof value === 'object' ? value : {};
  const rawWallet = source.wallet || source;
  const totalPc = (Math.max(0, Number.parseInt(rawWallet.po, 10) || 0) * 100)
    + (Math.max(0, Number.parseInt(rawWallet.pa, 10) || 0) * 10)
    + Math.max(0, Number.parseInt(rawWallet.pc, 10) || 0);
  return {
    characterName: cleanText(source.characterName || source.character_name),
    wallet: walletFromTotal(totalPc),
    weapons: safeRows(source.weapons, SECTION_FIELDS.weapons),
    armors: safeRows(source.armors, SECTION_FIELDS.armors),
    equipment: safeRows(source.equipment, SECTION_FIELDS.equipment),
    consumables: safeRows(source.consumables, SECTION_FIELDS.consumables),
    miscellaneous: safeRows(source.miscellaneous, SECTION_FIELDS.miscellaneous)
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
  const list = section === 'weapons' ? ' list="weapon-catalog-list"' : section === 'armors' ? ' list="armor-catalog-list"' : '';
  const input = (field, label, multiline = false) => multiline
    ? `<textarea data-row-field="${field}" aria-label="${label}">${escapeHtml(row[field])}</textarea>`
    : `<input data-row-field="${field}" value="${escapeHtml(row[field])}" aria-label="${label}"${field === 'name' ? list : ''}>`;
  const cells = section === 'weapons'
    ? `${input('name', 'Nom de l’arme')}${input('description', 'Description de l’arme', true)}${input('category', 'Catégorie de l’arme')}${input('brp', 'Pourcentage BRP')}${input('damage', 'Dégâts')}${input('hands', 'Nombre de mains')}${input('specials', 'Spécial de l’arme', true)}`
    : section === 'armors'
      ? `${input('name', 'Nom de l’armure')}${input('description', 'Description de l’armure', true)}${input('type', 'Type d’armure')}${input('protection', 'Protection')}${input('mobility', 'Mobilité')}${input('stealth', 'Discrétion')}${input('specials', 'Spécial de l’armure', true)}`
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
    equipmentCatalog = { weapons: [...melee, ...distance], armors: [...armors, ...shields] };
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
  if (!row || !['weapons', 'armors'].includes(section)) return false;
  const entry = findCatalogEntry(section, input.value);
  if (!entry) return false;
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
  body.innerHTML = inventory[section].map((row, index) => rowMarkup(section, row, index)).join('');
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
  const character = inventory.characterName || roomIdentity?.player || 'Personnage';
  document.getElementById('inventory-character').textContent = roomIdentity
    ? `${character} · ${roomIdentity.player} · salon ${roomIdentity.code}`
    : 'Mode local · rejoignez une partie pour sauvegarder cet inventaire sur Supabase.';
  renderWallet();
  Object.keys(SECTION_FIELDS).forEach(renderSection);
}

function collectRowsFromDom(section) {
  return Array.from(document.querySelectorAll(`tr[data-section="${section}"]`)).map(row =>
    Object.fromEntries(Array.from(row.querySelectorAll('[data-row-field]')).map(input => [input.dataset.rowField, cleanText(input.value)]))
  );
}

function collectFromDom() {
  Object.keys(SECTION_FIELDS).forEach(section => {
    inventory[section] = collectRowsFromDom(section);
  });
  return inventory;
}

function saveLocal({ collect = true } = {}) {
  if (collect) collectFromDom();
  localStorage.setItem(storageKey(), JSON.stringify(inventory));
}

function scheduleSave() {
  saveLocal();
  setStatus(roomIdentity ? 'Modifications en attente de sauvegarde…' : 'Inventaire enregistré localement.');
  clearTimeout(saveTimer);
  if (roomIdentity && supabase) {
    saveTimer = setTimeout(() => saveCloud({ automatic: true }), 700);
  }
}

function addRow(section, value = {}) {
  collectFromDom();
  inventory[section].push(Object.fromEntries(SECTION_FIELDS[section].map(field => [field, cleanText(value[field])])));
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

function cloudPayload() {
  collectFromDom();
  return {
    user_id: roomIdentity.userId,
    room_code: roomIdentity.code,
    player_name: roomIdentity.player,
    character_name: inventory.characterName,
    po: inventory.wallet.po,
    pa: inventory.wallet.pa,
    pc: inventory.wallet.pc,
    weapons: inventory.weapons,
    armors: inventory.armors,
    equipment: inventory.equipment,
    consumables: inventory.consumables,
    miscellaneous: inventory.miscellaneous,
    updated_at: new Date().toISOString()
  };
}

async function saveCloud({ automatic = false } = {}) {
  clearTimeout(saveTimer);
  if (!supabase) {
    if (!automatic) setStatus('Supabase n’est pas configuré.', 'error');
    return false;
  }
  if (!roomIdentity) {
    if (!automatic) setStatus('Rejoignez d’abord une partie.', 'error');
    return false;
  }
  const button = document.getElementById('inventory-save');
  button.disabled = true;
  if (!automatic) setStatus('Sauvegarde de l’inventaire…');
  const { error } = await supabase.from('pj_inventory').upsert(cloudPayload(), { onConflict: 'room_code,player_name' });
  button.disabled = false;
  if (error) {
    setStatus(`Sauvegarde impossible : ${inventoryError(error)}`, 'error');
    return false;
  }
  saveLocal();
  setStatus(`Inventaire sauvegardé dans le salon ${roomIdentity.code}.`, 'success');
  return true;
}

function inventoryFromCloud(row) {
  return normalizeInventory({
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

async function importFromCompleteSheet() {
  const migrated = emptyInventory();
  migrated.wallet = normalizeInventory({ wallet: importLegacyWallet() }).wallet;
  if (!supabase || !roomIdentity) return migrated;
  const { data, error } = await supabase.from('pj_sheets')
    .select('character_name,sheet_data')
    .eq('user_id', roomIdentity.userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.sheet_data) return migrated;

  const sheet = data.sheet_data;
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
  cloudLoadInProgress = true;
  document.getElementById('inventory-refresh').disabled = true;
  setStatus('Chargement de l’inventaire Supabase…');
  const { data, error } = await supabase.from('pj_inventory')
    .select('*')
    .eq('user_id', roomIdentity.userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  cloudLoadInProgress = false;
  document.getElementById('inventory-refresh').disabled = false;
  if (error) {
    setStatus(`Chargement impossible : ${inventoryError(error)}`, 'error');
    return;
  }
  if (data) {
    inventory = inventoryFromCloud(data);
    enrichInventoryFromCatalog();
    render();
    saveLocal({ collect: false });
    const date = data.updated_at ? new Date(data.updated_at).toLocaleString('fr-FR') : '';
    setStatus(`Inventaire chargé depuis Supabase${date ? ` · ${date}` : ''}.`, 'success');
    return;
  }

  inventory = await importFromCompleteSheet();
  render();
  saveLocal({ collect: false });
  setStatus('Nouvel inventaire créé à partir de la fiche complète et de l’ancienne bourse.');
  await saveCloud({ automatic: true });
}

async function reloadIdentity() {
  const nextIdentity = identityFromStorage();
  const changed = nextIdentity?.code !== roomIdentity?.code
    || nextIdentity?.player !== roomIdentity?.player
    || nextIdentity?.userId !== roomIdentity?.userId;
  if (!changed) return;
  roomIdentity = nextIdentity;
  inventory = emptyInventory();
  try {
    inventory = normalizeInventory(JSON.parse(localStorage.getItem(storageKey())));
  } catch (error) {
    inventory = emptyInventory();
  }
  render();
  await loadCloud();
}

document.addEventListener('input', event => {
  const unit = event.target.id?.match(/^inventory-(po|pa|pc)$/)?.[1];
  if (unit) moneyInputChanged(unit);
  else if (event.target.matches('[data-row-field]')) {
    if (event.target.dataset.rowField === 'name') applyCatalogSelection(event.target);
    scheduleSave();
  }
});
document.addEventListener('click', event => {
  const add = event.target.closest('[data-add-row]');
  if (add) addRow(add.dataset.addRow);
  const remove = event.target.closest('[data-remove-row]');
  if (remove) removeRow(remove.dataset.removeRow, Number(remove.dataset.rowIndex));
  const money = event.target.closest('[data-money-unit]');
  if (money) changeMoney(money.dataset.moneyUnit, Number(money.dataset.moneyDelta));
});
document.getElementById('inventory-save').addEventListener('click', () => saveCloud());
document.getElementById('inventory-refresh').addEventListener('click', () => loadCloud({ manual: true }));
window.addEventListener('message', event => {
  if (event.data?.type === 'diceforge:inventory-refresh') reloadIdentity();
});
window.addEventListener('storage', event => {
  if (event.key === ROOM_STORAGE_KEY) reloadIdentity();
});

try {
  inventory = normalizeInventory(JSON.parse(localStorage.getItem(storageKey())));
} catch (error) {
  inventory = emptyInventory();
}
render();
Promise.all([loadEquipmentCatalog(), loadWeaponSkillScores()]).then(() => {
  enrichInventoryFromCatalog();
  render();
  saveLocal({ collect: false });
  loadCloud();
});
