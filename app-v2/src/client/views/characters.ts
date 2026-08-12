import { cloud, type CharacterRecord, type CharacterInvitation, type InventoryRecord, type InvitableCharacter, type SheetRecord } from '../cloud.js';
import type { SessionStore } from '../session-store.js';
import type { SessionState } from '../../shared/contracts.js';
import { api, escapeHtml } from '../http.js';
import { publishRollToObsRelay } from '../obs-relay.js';
import { evaluateBrpTest, type BrpDifficulty, type DiceExpression, type DiceRoll } from '../../shared/dice.js';
import { playableSheet, PLAYABLE_SKILL_GROUPS, skillBase, structuredSheetToMarkdown, type PlayableSheet } from '../../shared/sheet.js';
import type { ArmorCatalogItem, EquipmentCatalog, StoredEquipmentItem, WeaponCatalogItem } from '../../shared/equipment.js';

type Notify = (message: string, error?: boolean) => void;

const DEFAULT_STATS = { force: 10, constitution: 10, taille: 10, intelligence: 10, pouvoir: 10, dexterite: 10, charisme: 10 };

export async function renderCharacters(workspace: HTMLElement, sessionStore: SessionStore, notify: Notify): Promise<void> {
  let session = sessionStore.value;
  const user = await cloud.user().catch(() => null);
  if (!user) return renderLogin(workspace, sessionStore, notify);
  const [character, inventory, sheet, catalog] = await Promise.all([cloud.character(), cloud.inventory(session), cloud.sheet(session), api<EquipmentCatalog>('/api/equipment-catalog')]);
  const invitations = await cloud.invitations();
  const canonicalPlayer = character?.player_name || sheet?.player_name || inventory?.player_name || session.playerName;
  const resolvedRoom = session.room || sheet?.room_code || inventory?.room_code || '';
  if (canonicalPlayer !== session.playerName || resolvedRoom !== session.room) {
    sessionStore.update({ playerName: canonicalPlayer, room: resolvedRoom });
    session = sessionStore.value;
  }
  let rerollsUsed = character?.rerolls_used ?? 0;
  let hasGeneratedStats = character !== null;
  let activeSheetData = structuredClone(sheet?.sheet_data ?? {});
  const roomOwner = session.room ? await cloud.isRoomOwner(session.room).catch(() => false) : false;
  const invitable = roomOwner ? await cloud.invitableCharacters(session.room).catch(() => []) : [];
  workspace.innerHTML = `<section class="tool-header compact"><div><p class="eyebrow">Supabase</p><h1>Personnage et inventaire</h1><p>${escapeHtml(session.playerName || 'Joueur non renseigné')} · ${escapeHtml(session.room || 'Aucune room')}</p></div><div class="toolbar"><button id="backup-sheets">Sauvegarder les fiches</button><button id="join-room">Rejoindre la room</button><button id="logout">Déconnexion</button></div></section>
    ${invitationHtml(invitations)}${roomOwner ? inviteCharactersHtml(invitable) : ''}
    <section class="character-grid"><form class="sheet-card" id="character-form"><h2>Identité et caractéristiques</h2>${characterFields(character, session.playerName)}<div class="form-actions"><button type="button" id="generate-stats" ${rerollsUsed >= 2 ? 'disabled' : ''}>Générer les caractéristiques</button><span id="reroll-status">${rerollLabel(rerollsUsed)}</span><button class="primary">Enregistrer le personnage</button></div></form>
    <form class="sheet-card equipment-sheet" id="inventory-form"><div class="section-title"><div><h2>Équipement</h2><p class="muted">Armes et protections issues des aides de jeu.</p></div></div>${inventoryFields(inventory, character?.nom ?? '', catalog)}<button class="primary">Enregistrer l’équipement</button></form>
    <form class="sheet-card full-sheet" id="sheet-form">${sheetFields(sheet, character?.nom ?? '')}<div class="form-actions sheet-view-actions"><button type="button" id="print-sheet">Imprimer / PDF</button><button type="button" class="primary" id="edit-sheet">Modifier la fiche</button></div></form>
    <form class="sheet-card account-card" id="password-form"><h2>Compte</h2><label>Nouveau mot de passe<input name="password" type="password" minlength="8" required></label><button>Changer le mot de passe</button></form></section>`;
  document.querySelector('#logout')?.addEventListener('click', () => void cloud.logout().then(() => { window.dispatchEvent(new Event('diceforge-auth-changed')); return renderCharacters(workspace, sessionStore, notify); }));
  document.querySelector('#join-room')?.addEventListener('click', () => {
    const targetSession = sessionStore.value;
    void cloud.joinRoom(targetSession).then(() => { notify(`Personnage exporté dans la room ${targetSession.room}.`); return renderCharacters(workspace, sessionStore, notify); }).catch((error) => notify(error.message, true));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-accept-invitation]').forEach((button) => button.addEventListener('click', () => {
    void cloud.acceptInvitation(Number(button.dataset.acceptInvitation)).then((room) => { sessionStore.update({ room }); notify(`Personnage exporté dans la room ${room}. Les coches d’expérience ont été remises à zéro.`); return renderCharacters(workspace, sessionStore, notify); }).catch((error) => notify(error.message, true));
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-invite-user]').forEach((button) => button.addEventListener('click', () => {
    void cloud.inviteCharacter(session.room, button.dataset.inviteUser!, button.dataset.sourceRoom!).then(() => { button.disabled = true; button.textContent = 'Invitation envoyée'; }).catch((error) => notify(error.message, true));
  }));
  document.querySelector<HTMLButtonElement>('#backup-sheets')?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    void cloud.characterBackup().then((backup) => api<{ filename: string; itemCount: number }>('/api/backups/character-sheets', { method: 'POST', body: JSON.stringify(backup) }))
      .then((saved) => notify(`Sauvegarde créée : ${saved.filename} (${saved.itemCount} éléments).`))
      .catch((error) => notify(error.message, true)).finally(() => { button.disabled = false; });
  });
  document.querySelector<HTMLButtonElement>('#generate-stats')?.addEventListener('click', (event) => {
    if (hasGeneratedStats && rerollsUsed >= 2) return;
    const roll = (count: number, bonus = 0) => Array.from({ length: count }, () => crypto.getRandomValues(new Uint32Array(1))[0]! % 6 + 1).reduce((sum, value) => sum + value, bonus);
    for (const key of ['force', 'constitution', 'pouvoir', 'dexterite', 'charisme']) document.querySelector<HTMLInputElement>(`[name="${key}"]`)!.value = String(roll(3));
    for (const key of ['taille', 'intelligence']) document.querySelector<HTMLInputElement>(`[name="${key}"]`)!.value = String(roll(2, 6));
    if (hasGeneratedStats) rerollsUsed += 1;
    hasGeneratedStats = true;
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = rerollsUsed >= 2;
    const status = document.querySelector<HTMLElement>('#reroll-status');
    if (status) status.textContent = rerollLabel(rerollsUsed);
    notify(rerollsUsed ? `Caractéristiques relancées (${rerollsUsed}/2).` : 'Caractéristiques générées. Deux relances restent disponibles.');
  });
  document.querySelector<HTMLFormElement>('#character-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement));
    const record = { player_name: character?.player_name || session.playerName, nom: String(data.nom), espece: String(data.espece || '') || null, genre: String(data.genre || '') || null, age: data.age ? Number(data.age) : null, profession: String(data.profession || '') || null, richesse: String(data.richesse || '') || null, traits: String(data.traits || '') || null, notes: String(data.notes || '') || null, rerolls_used: rerollsUsed, ...Object.fromEntries(Object.keys(DEFAULT_STATS).map((key) => [key, Number(data[key]) || 10])) } as Omit<CharacterRecord, 'user_id'>;
    void cloud.saveCharacter(record).then(() => notify('Personnage enregistré.')).catch((error) => notify(error.message, true));
  });
  document.querySelector<HTMLFormElement>('#inventory-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const weapons = data.getAll('weapon_name').map(String).filter(Boolean).map((name) => catalog.weapons.find((item) => item.name === name) ?? { kind: 'weapon', name });
    const armors = data.getAll('armor_name').map(String).filter(Boolean).map((name) => catalog.armors.find((item) => item.name === name) ?? { kind: 'armor', name });
    const lineItems = (name: string) => data.getAll(name).map(String).map((item) => item.trim()).filter(Boolean);
    const record = { character_name: String(data.get('character_name') || ''), po: Number(data.get('po')) || 0, pa: Number(data.get('pa')) || 0, pc: Number(data.get('pc')) || 0, weapons, armors, equipment: lineItems('equipment_item'), consumables: lineItems('consumable_item'), miscellaneous: lineItems('miscellaneous_item') } as Omit<InventoryRecord, 'user_id' | 'room_code' | 'player_name'>;
    const existingWeapons = Array.isArray(activeSheetData.weapons) ? activeSheetData.weapons as Array<Record<string, unknown>> : [];
    activeSheetData.weapons = weapons.map((weapon) => {
      const previous = existingWeapons.find((item) => String(item.name || '') === weapon.name) ?? {};
      return { ...previous, name: weapon.name, damage: 'damage' in weapon ? weapon.damage : String(previous.damage || ''), catalog: weapon };
    });
    const wornArmor = armors.find((armor): armor is ArmorCatalogItem => 'armorPoints' in armor && armor.armorPoints > 0);
    const fields = activeSheetData.fields && typeof activeSheetData.fields === 'object' && !Array.isArray(activeSheetData.fields) ? activeSheetData.fields as Record<string, unknown> : {};
    activeSheetData.fields = { ...fields, armorType: wornArmor?.name ?? '', armorPoints: wornArmor ? String(wornArmor.armorPoints) : '', equipment: [...record.equipment, ...record.consumables, ...record.miscellaneous].map(storedName).join('\n') };
    void Promise.all([
      cloud.saveInventory(session, record, inventory?.player_name || canonicalPlayer),
      cloud.saveSheet(session, { character_name: record.character_name, sheet_data: activeSheetData, markdown_content: structuredSheetToMarkdown(activeSheetData, record.character_name) }, sheet?.player_name || canonicalPlayer),
    ]).then(() => notify('Équipement et fiche synchronisés.')).catch((error) => notify(error.message, true));
  });
  bindEquipmentRows(catalog);
  document.querySelector<HTMLFormElement>('#sheet-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const sheetData = structuredSheetData(data, activeSheetData);
    const characterName = String(data.get('character_name') || character?.nom || 'Personnage').trim();
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    void cloud.saveSheet(session, { character_name: characterName, sheet_data: sheetData, markdown_content: structuredSheetToMarkdown(sheetData, characterName) }, sheet?.player_name || canonicalPlayer)
      .then(() => { notify('Fiche enregistrée dans Supabase.'); return renderCharacters(workspace, sessionStore, notify); })
      .catch((error) => { notify(error.message, true); if (submit) submit.disabled = false; });
  });
  document.querySelector('#edit-sheet')?.addEventListener('click', () => toggleSheetEditor(true));
  document.querySelector('#cancel-sheet-edit')?.addEventListener('click', () => toggleSheetEditor(false));
  document.querySelector<HTMLElement>('#sheet-editor')?.addEventListener('input', (event) => {
    if ((event.target as HTMLInputElement).matches('input[name="stat_score"], input[name="skill_points"], input[name="skill_name"]')) refreshEditedSkillScores(event.currentTarget as HTMLElement);
  });
  document.querySelector('#print-sheet')?.addEventListener('click', () => window.print());
  document.querySelector<HTMLInputElement>('#sheet-skill-search')?.addEventListener('input', (event) => {
    const query = (event.currentTarget as HTMLInputElement).value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    document.querySelectorAll<HTMLElement>('[data-skill-row]').forEach((row) => { row.hidden = !row.dataset.skillRow!.includes(query); });
    document.querySelectorAll<HTMLDetailsElement>('[data-skill-group]').forEach((group) => {
      const hasMatch = [...group.querySelectorAll<HTMLElement>('[data-skill-row]')].some((row) => !row.hidden);
      group.hidden = Boolean(query) && !hasMatch;
      if (query && hasMatch) group.open = true;
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-sheet-roll]').forEach((button) => button.addEventListener('click', () => {
    void (async () => {
      const score = Number(button.dataset.sheetRoll);
      const difficulty = document.querySelector<HTMLSelectElement>('#sheet-difficulty')!.value as BrpDifficulty;
      const labels = { critical: 'Réussite critique', special: 'Réussite spéciale', success: 'Réussite', failure: 'Échec', fumble: 'Maladresse' } as const;
      const difficultyLabels: Record<BrpDifficulty, string> = { automatic: 'Automatique', easy: 'Facile', normal: 'Normale', hard: 'Difficile', impossible: 'Impossible' };
      const rollLabel = button.dataset.rollLabel || 'Test';
      const experienceSkill = button.dataset.experienceSkill || '';
      const target = document.querySelector<HTMLElement>('#sheet-roll-result')!;
      const expressionLabel = `${rollLabel} ${score}% · ${difficultyLabels[difficulty]}`;
      const hidden = document.querySelector<HTMLInputElement>('#sheet-hidden-roll')?.checked ?? false;
      if (hidden) {
        if (!session.room || !session.playerName) throw new Error('Renseignez le joueur et la room avant un jet caché.');
        const expression: DiceExpression = { source: expressionLabel, dice: difficulty === 'automatic' || difficulty === 'impossible' ? [] : [{ count: 1, sides: 100, sign: 1 }], modifier: difficulty === 'impossible' ? 100 : 0 };
        const saved = await cloud.rollHidden(session, expression, expressionLabel, experienceSkill && expression.dice.length ? { skill: experienceSkill, difficulty } : undefined);
        if (!saved.is_owner || saved.total === null) {
          target.className = 'sheet-roll-result hidden';
          target.innerHTML = '<strong>🔒 Jet caché transmis</strong><span>Seul le créateur de la room peut voir le résultat.</span>';
          notify('Jet caché envoyé au MJ.');
        } else {
          const ownerTest = evaluateBrpTest(score, difficulty, () => saved.total!);
          target.className = `sheet-roll-result ${ownerTest.outcome}`;
          target.innerHTML = `<strong>${escapeHtml(rollLabel)} : ${ownerTest.roll ?? '—'}</strong><span>${labels[ownerTest.outcome]} · seuil ${ownerTest.threshold}% · caché</span>`;
        }
        await refreshSheetRollHistory(session);
        return;
      }
      const test = evaluateBrpTest(score, difficulty);
      target.className = `sheet-roll-result ${test.outcome}`;
      target.innerHTML = `<strong>${escapeHtml(rollLabel)} : ${test.roll ?? '—'}</strong><span>${labels[test.outcome]} · seuil ${test.threshold}%</span>`;
      if (!session.room || !session.playerName) return;
      const roll: DiceRoll = { expression: expressionLabel, results: test.roll === null ? [] : [{ count: 1, sides: 100, sign: 1, values: [test.roll], subtotal: test.roll }], modifier: 0, total: test.roll ?? (test.outcome === 'success' ? 0 : 100) };
      await cloud.saveRoll(session, roll);
      void publishRollToObsRelay(session, roll, 'dice_forge_v2:character_sheet');
      if (experienceSkill && test.roll !== null && ['critical', 'special', 'success'].includes(test.outcome)) {
        const skills = Array.isArray(activeSheetData.skills) ? activeSheetData.skills as Array<Record<string, unknown>> : [];
        const skill = skills.find((item) => String(item.name || '') === experienceSkill);
        if (skill && !skill.checked) {
          skill.checked = true;
          const characterName = sheet?.character_name || character?.nom || 'Personnage';
          await cloud.saveSheet(session, { character_name: characterName, sheet_data: activeSheetData, markdown_content: structuredSheetToMarkdown(activeSheetData, characterName) }, sheet?.player_name || canonicalPlayer);
          button.closest('tr')?.classList.add('trained');
          button.closest('tr')?.querySelector('td:first-child')?.insertAdjacentHTML('beforeend', ' <span title="Expérience">✓</span>');
          notify('Réussite : expérience cochée et enregistrée.');
        }
      }
      await refreshSheetRollHistory(session);
      notify('Jet envoyé dans la room.');
    })().catch((error: Error) => notify(error.message, true));
  }));
  void refreshSheetRollHistory(session);
  document.querySelector<HTMLFormElement>('#password-form')?.addEventListener('submit', (event) => {
    event.preventDefault(); const password = String(new FormData(event.currentTarget as HTMLFormElement).get('password') || '');
    void cloud.changePassword(password).then(() => notify('Mot de passe modifié.')).catch((error) => notify(error.message, true));
  });
}

function invitationHtml(invitations: CharacterInvitation[]): string {
  if (!invitations.length) return '';
  return `<section class="invitation-panel"><h2>Invitations de personnage</h2>${invitations.map((invitation) => `<article><div><strong>${escapeHtml(invitation.character_name)}</strong><span>${escapeHtml(invitation.source_room)} → ${escapeHtml(invitation.room_code)}</span></div><button class="primary" data-accept-invitation="${invitation.invitation_id}">Accepter et exporter</button></article>`).join('')}</section>`;
}

function inviteCharactersHtml(characters: InvitableCharacter[]): string {
  return `<section class="invitation-panel"><h2>Inviter un personnage existant</h2>${characters.length ? characters.map((character) => `<article><div><strong>${escapeHtml(character.character_name)}</strong><span>${escapeHtml(character.player_name)} · room ${escapeHtml(character.source_room)}</span></div><button data-invite-user="${escapeHtml(character.user_id)}" data-source-room="${escapeHtml(character.source_room)}">Inviter</button></article>`).join('') : '<p class="muted">Aucun personnage disponible dans vos autres rooms.</p>'}</section>`;
}

function rerollLabel(used: number): string {
  return `${Math.max(0, 2 - used)} relance${used === 1 ? '' : 's'} restante${used === 1 ? '' : 's'}`;
}

function renderLogin(workspace: HTMLElement, sessionStore: SessionStore, notify: Notify): void {
  workspace.innerHTML = `<section class="auth-panel"><p class="eyebrow">Compte joueur</p><h1>Connexion Supabase</h1><p>Les données restent liées à l’identifiant permanent du compte.</p><form id="login-form"><label>Nom du joueur<input name="player" required value="${escapeHtml(sessionStore.value.playerName)}"></label><label>Mot de passe<input name="password" type="password" required></label><button class="primary">Se connecter</button></form></section>`;
  document.querySelector<HTMLFormElement>('#login-form')?.addEventListener('submit', (event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement); const player = String(data.get('player') || '');
    void cloud.login(player, String(data.get('password') || '')).then(() => { sessionStore.update({ playerName: player }); window.dispatchEvent(new Event('diceforge-auth-changed')); return renderCharacters(workspace, sessionStore, notify); }).catch((error) => notify(error.message, true));
  });
}

function characterFields(character: CharacterRecord | null, playerName: string): string {
  const value = (key: keyof CharacterRecord, fallback = '') => escapeHtml(character?.[key] ?? fallback);
  const stats = Object.keys(DEFAULT_STATS).map((key) => `<label>${key.toUpperCase()}<input name="${key}" type="number" min="1" value="${value(key as keyof CharacterRecord, '10')}"></label>`).join('');
  return `<div class="form-grid"><label>Joueur<input value="${escapeHtml(playerName)}" disabled></label><label>Nom<input name="nom" required value="${value('nom')}"></label><label>Espèce<input name="espece" value="${value('espece')}"></label><label>Genre<input name="genre" value="${value('genre')}"></label><label>Âge<input name="age" type="number" min="0" value="${value('age')}"></label><label>Profession<input name="profession" value="${value('profession')}"></label></div><div class="stats-grid">${stats}</div><label>Richesse<input name="richesse" value="${value('richesse')}"></label><label>Traits<textarea name="traits">${value('traits')}</textarea></label><label>Notes<textarea name="notes">${value('notes')}</textarea></label>`;
}

function storedName(item: StoredEquipmentItem): string {
  return typeof item === 'string' ? item : String(item.name || '');
}

function inventoryFields(inventory: InventoryRecord | null, characterName: string, catalog: EquipmentCatalog): string {
  const weaponRows = (inventory?.weapons?.length ? inventory.weapons : ['']).map((item) => equipmentCatalogRow('weapon', storedName(item), catalog.weapons)).join('');
  const armorRows = (inventory?.armors?.length ? inventory.armors : ['']).map((item) => equipmentCatalogRow('armor', storedName(item), catalog.armors)).join('');
  const simpleRows = (key: 'equipment' | 'consumables' | 'miscellaneous', title: string, inputName: string) => {
    const values = inventory?.[key]?.length ? inventory[key].map(storedName) : [''];
    return `<section class="equipment-group"><div class="equipment-group-title"><h3>${title}</h3><button type="button" data-add-simple="${inputName}">+ Ajouter</button></div><div data-simple-list="${inputName}">${values.map((value) => simpleEquipmentRow(inputName, value)).join('')}</div></section>`;
  };
  return `<input type="hidden" name="character_name" value="${escapeHtml(inventory?.character_name || characterName)}"><div class="money-grid"><label>PO<input name="po" type="number" min="0" value="${inventory?.po ?? 0}"></label><label>PA<input name="pa" type="number" min="0" value="${inventory?.pa ?? 0}"></label><label>PC<input name="pc" type="number" min="0" value="${inventory?.pc ?? 0}"></label></div>
    <section class="equipment-group"><div class="equipment-group-title"><h3>Armes</h3><button type="button" data-add-catalog="weapon">+ Ajouter une arme</button></div><div data-catalog-list="weapon">${weaponRows}</div></section>
    <section class="equipment-group"><div class="equipment-group-title"><h3>Armures et protections</h3><button type="button" data-add-catalog="armor">+ Ajouter une protection</button></div><div data-catalog-list="armor">${armorRows}</div></section>
    ${simpleRows('equipment', 'Équipement courant', 'equipment_item')}${simpleRows('consumables', 'Consommables', 'consumable_item')}${simpleRows('miscellaneous', 'Divers', 'miscellaneous_item')}`;
}

function equipmentCatalogRow(kind: 'weapon' | 'armor', selected: string, items: Array<WeaponCatalogItem | ArmorCatalogItem>): string {
  const chosen = items.find((item) => item.name === selected);
  const options = ['', ...items.map((item) => item.name)].map((name) => `<option value="${escapeHtml(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name || `Choisir ${kind === 'weapon' ? 'une arme' : 'une protection'}…`)}</option>`).join('');
  const legacy = selected && !chosen ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>` : '';
  return `<div class="equipment-row" data-equipment-row="${kind}"><select name="${kind}_name">${options}${legacy}</select><div class="equipment-auto">${catalogDetails(chosen)}</div><button type="button" class="danger" data-remove-equipment aria-label="Supprimer">×</button></div>`;
}

function catalogDetails(item?: WeaponCatalogItem | ArmorCatalogItem): string {
  if (!item) return '<span>Sélectionnez un élément pour afficher ses caractéristiques.</span>';
  if (item.kind === 'weapon') return `<strong>${escapeHtml(item.damage)}</strong><span>${escapeHtml([item.category, item.range, `${item.hands} main(s)`, item.traits, item.price].filter(Boolean).join(' · '))}</span>`;
  return `<strong>${item.armorPoints ? `${item.armorPoints} PA` : escapeHtml(item.traits)}</strong><span>${escapeHtml([item.category, item.mobility && `Mobilité ${item.mobility}`, item.stealth && `Discrétion ${item.stealth}`, item.price].filter(Boolean).join(' · '))}</span>`;
}

function simpleEquipmentRow(name: string, value = ''): string {
  return `<div class="equipment-row simple"><input name="${name}" value="${escapeHtml(value)}" placeholder="Nom de l’objet"><button type="button" class="danger" data-remove-equipment aria-label="Supprimer">×</button></div>`;
}

function bindEquipmentRows(catalog: EquipmentCatalog): void {
  const form = document.querySelector<HTMLFormElement>('#inventory-form');
  if (!form) return;
  form.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-remove-equipment]')) return target.closest('.equipment-row')?.remove();
    const catalogButton = target.closest<HTMLButtonElement>('[data-add-catalog]');
    if (catalogButton) {
      const kind = catalogButton.dataset.addCatalog as 'weapon' | 'armor';
      form.querySelector(`[data-catalog-list="${kind}"]`)?.insertAdjacentHTML('beforeend', equipmentCatalogRow(kind, '', kind === 'weapon' ? catalog.weapons : catalog.armors));
    }
    const simpleButton = target.closest<HTMLButtonElement>('[data-add-simple]');
    if (simpleButton) form.querySelector(`[data-simple-list="${simpleButton.dataset.addSimple}"]`)?.insertAdjacentHTML('beforeend', simpleEquipmentRow(simpleButton.dataset.addSimple!));
  });
  form.addEventListener('change', (event) => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>('select[name="weapon_name"], select[name="armor_name"]');
    if (!select) return;
    const item = select.name === 'weapon_name' ? catalog.weapons.find((entry) => entry.name === select.value) : catalog.armors.find((entry) => entry.name === select.value);
    const detail = select.closest('.equipment-row')?.querySelector<HTMLElement>('.equipment-auto');
    if (detail) detail.innerHTML = catalogDetails(item);
  });
}

function sheetFields(sheet: SheetRecord | null, characterName: string): string {
  const name = sheet?.character_name || characterName;
  const model = playableSheet(sheet?.sheet_data ?? {}, name);
  return `${playableSheetHtml(model)}${sheetEditorHtml(model)}`;
}

function sheetEditorHtml(sheet: PlayableSheet): string {
  const value = (content: string | number) => escapeHtml(content);
  const stats = sheet.stats.length ? sheet.stats : [
    { key: 'force', label: 'FOR', score: 10 }, { key: 'constitution', label: 'CON', score: 10 }, { key: 'taille', label: 'TAI', score: 10 },
    { key: 'intelligence', label: 'INT', score: 10 }, { key: 'pouvoir', label: 'POU', score: 10 }, { key: 'dexterite', label: 'DEX', score: 10 }, { key: 'apparence', label: 'APP', score: 10 },
  ];
  const statFields = stats.map((stat) => `<label>${value(stat.label)}<input type="hidden" name="stat_key" value="${value(stat.key)}"><input name="stat_score" type="number" min="1" max="100" required value="${stat.score}"></label>`).join('');
  const skillRows = sheet.skills.map((skill) => `<tr data-edit-skill><td><input name="skill_name" type="hidden" value="${value(skill.name)}"><strong>${value(skill.name)}</strong></td><td><output data-skill-base>${skill.base}</output></td><td><input name="skill_points" type="number" min="0" max="100" value="${skill.points}"></td><td><output data-skill-score>${skill.score}</output></td><td>${skill.checked ? '✓' : '—'}</td></tr>`).join('');
  const weapons = [...sheet.weapons, { name: '', contactScore: 0, distanceScore: 0, damage: '' }];
  const weaponRows = weapons.map((weapon) => `<tr><td><input name="weapon_name" value="${value(weapon.name)}" placeholder="Nouvelle arme"></td><td><input name="weapon_contact" type="number" min="0" max="100" value="${weapon.contactScore}"></td><td><input name="weapon_distance" type="number" min="0" max="100" value="${weapon.distanceScore}"></td><td><input name="weapon_damage" value="${value(weapon.damage)}"></td></tr>`).join('');
  const spells = [...sheet.spells, { name: '', points: 0, checked: false }];
  const spellRows = spells.map((spell, index) => `<tr><td><input name="spell_name" value="${value(spell.name)}" placeholder="Nouveau pouvoir"></td><td><input name="spell_points" type="number" min="0" value="${spell.points}"></td><td><input name="spell_checked_${index}" type="checkbox" value="1" ${spell.checked ? 'checked' : ''}></td></tr>`).join('');
  return `<section class="sheet-editor" id="sheet-editor" hidden><div class="section-title"><div><p class="eyebrow">Édition structurée</p><h2>Modifier la fiche</h2></div><span>Les changements seront enregistrés directement dans Supabase.</span></div>
    <div class="full-sheet-grid"><label>Nom<input name="character_name" required value="${value(sheet.name)}"></label><label>Joueur<input name="field_player" value="${value(sheet.player)}"></label><label>Race<input name="field_race" value="${value(sheet.race)}"></label><label>Profession<input name="field_profession" value="${value(sheet.profession)}"></label></div>
    <h3>Caractéristiques</h3><div class="stats-grid">${statFields}</div>
    <h3>Compétences</h3><p class="muted">Seuls les points investis sont modifiables. Base et score sont calculés automatiquement.</p><div class="table-scroll"><table class="sheet-edit-table"><thead><tr><th>Compétence</th><th>Base</th><th>Points</th><th>Score</th><th>Exp.</th></tr></thead><tbody>${skillRows}</tbody></table></div>
    <h3>Armes</h3><div class="table-scroll"><table class="sheet-edit-table"><thead><tr><th>Arme</th><th>Contact</th><th>Distance</th><th>Dégâts</th></tr></thead><tbody>${weaponRows}</tbody></table></div>
    <h3>Sorts et pouvoirs</h3><div class="table-scroll"><table class="sheet-edit-table"><thead><tr><th>Nom</th><th>Points</th><th>Exp.</th></tr></thead><tbody>${spellRows}</tbody></table></div>
    <div class="full-sheet-grid sheet-text-fields"><label>Type d’armure<input name="field_armorType" value="${value(sheet.armorType)}"></label><label>Points d’armure<input name="field_armorPoints" value="${value(sheet.armorPoints)}"></label><label>Mouvement<input name="field_movement" type="number" min="0" value="${sheet.movement}"></label><label>Pouvoirs<textarea name="field_powers">${value(sheet.powers)}</textarea></label><label>Équipement et richesse<textarea name="field_equipment">${value(sheet.equipment)}</textarea></label><label>Origine<textarea name="field_origin">${value(sheet.origin)}</textarea></label><label>Liens avec les PNJ<textarea name="field_npcLinks">${value(sheet.npcLinks)}</textarea></label><label>Liens avec les factions<textarea name="field_factionLinks">${value(sheet.factionLinks)}</textarea></label><label>Motivation<textarea name="field_motivation">${value(sheet.motivation)}</textarea></label><label>Notes de jeu<textarea name="field_notes">${value(sheet.notes)}</textarea></label></div>
    <div class="form-actions"><button type="button" id="cancel-sheet-edit">Annuler</button><button type="submit" class="primary">Valider et enregistrer</button></div></section>`;
}

function toggleSheetEditor(editing: boolean): void {
  const form = document.querySelector<HTMLFormElement>('#sheet-form');
  const editor = document.querySelector<HTMLElement>('#sheet-editor');
  if (!form || !editor) return;
  form.classList.toggle('editing', editing);
  editor.hidden = !editing;
  if (editing) {
    refreshEditedSkillScores(editor);
    editor.querySelector<HTMLInputElement>('input')?.focus();
  }
}

function refreshEditedSkillScores(editor: HTMLElement): void {
  const stats = Object.fromEntries([...editor.querySelectorAll<HTMLInputElement>('input[name="stat_key"]')].map((keyInput, index) => {
    const scores = editor.querySelectorAll<HTMLInputElement>('input[name="stat_score"]');
    return [keyInput.value, Number(scores[index]?.value) || 0];
  }));
  editor.querySelectorAll<HTMLTableRowElement>('[data-edit-skill]').forEach((row) => {
    const name = row.querySelector<HTMLInputElement>('input[name="skill_name"]')?.value.trim() || '';
    const points = Number(row.querySelector<HTMLInputElement>('input[name="skill_points"]')?.value) || 0;
    const base = skillBase(name, stats);
    const baseOutput = row.querySelector<HTMLOutputElement>('[data-skill-base]');
    const scoreOutput = row.querySelector<HTMLOutputElement>('[data-skill-score]');
    if (baseOutput) baseOutput.value = String(base);
    if (scoreOutput) scoreOutput.value = String(base + points);
  });
}

function structuredSheetData(data: FormData, previous: Record<string, unknown>): Record<string, unknown> {
  const strings = (name: string) => data.getAll(name).map(String);
  const numbers = (name: string) => strings(name).map((value) => Number(value) || 0);
  const previousFields = previous.fields && typeof previous.fields === 'object' && !Array.isArray(previous.fields) ? previous.fields as Record<string, unknown> : {};
  const characterName = String(data.get('character_name') || 'Personnage').trim();
  const fields: Record<string, unknown> = { ...previousFields, name: characterName };
  for (const key of ['player', 'race', 'profession', 'armorType', 'armorPoints', 'movement', 'powers', 'equipment', 'origin', 'npcLinks', 'factionLinks', 'motivation', 'notes']) fields[key] = String(data.get(`field_${key}`) || '');
  const statKeys = strings('stat_key');
  const statScores = numbers('stat_score');
  const stats = Object.fromEntries(statKeys.map((key, index) => [key, statScores[index] ?? 0]));
  const skillNames = strings('skill_name');
  const skillPoints = numbers('skill_points');
  const previousSkills = Array.isArray(previous.skills) ? previous.skills : [];
  const wasChecked = (name: string) => previousSkills.some((item) => item && typeof item === 'object' && String((item as Record<string, unknown>).name || '') === name && Boolean((item as Record<string, unknown>).checked));
  const skills = skillNames.map((name, index) => { const cleanName = name.trim(); const base = skillBase(cleanName, stats); const points = skillPoints[index] ?? 0; return { name: cleanName, base, points, score: base + points, checked: wasChecked(cleanName) }; }).filter((skill) => skill.name);
  const weaponNames = strings('weapon_name');
  const weaponContacts = numbers('weapon_contact');
  const weaponDistances = numbers('weapon_distance');
  const weaponDamages = strings('weapon_damage');
  const weapons = weaponNames.map((name, index) => ({ name: name.trim(), contactScore: weaponContacts[index] ?? 0, distanceScore: weaponDistances[index] ?? 0, damage: weaponDamages[index] ?? '' })).filter((weapon) => weapon.name);
  const spellNames = strings('spell_name');
  const spellPoints = numbers('spell_points');
  const spells = spellNames.map((name, index) => ({ name: name.trim(), points: spellPoints[index] ?? 0, checked: data.has(`spell_checked_${index}`) })).filter((spell) => spell.name);
  return { ...previous, fields, stats, skills, weapons, spells };
}

function multiline(value: string): string {
  return escapeHtml(value).replace(/&lt;br\s*\/?&gt;/gi, '<br>').replace(/\r?\n/g, '<br>');
}

function searchKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function infoBlock(title: string, value: string): string {
  return value.trim() ? `<article><h3>${title}</h3><p>${multiline(value)}</p></article>` : '';
}

function playableSheetHtml(sheet: PlayableSheet): string {
  const rollButton = (score: number, label: string, experienceSkill = '') => score >= 1 && score <= 100 ? `<button type="button" data-sheet-roll="${score}" data-roll-label="${escapeHtml(label)}"${experienceSkill ? ` data-experience-skill="${escapeHtml(experienceSkill)}"` : ''}>${score}%</button>` : `${score}%`;
  const skillGroups = PLAYABLE_SKILL_GROUPS.map((group, index) => {
    const skills = sheet.skills.filter((skill) => skill.group === group);
    const trained = skills.filter((skill) => skill.points > 0 || skill.checked).length;
    const rows = skills.map((skill) => `<tr data-skill-row="${escapeHtml(searchKey(skill.name))}" class="${skill.points > 0 || skill.checked ? 'trained' : ''}"><td>${escapeHtml(skill.name)}${skill.checked ? ' <span title="Expérience">✓</span>' : ''}</td><td>${skill.base}</td><td>${skill.points}</td><td>${rollButton(skill.score, skill.name, skill.name)}</td></tr>`).join('');
    return `<details class="skill-group" data-skill-group="${escapeHtml(searchKey(group))}" ${index === 0 ? 'open' : ''}><summary><strong>${escapeHtml(group)}</strong><span>${trained} entraînée${trained > 1 ? 's' : ''} · ${skills.length} compétences</span></summary><div class="table-scroll"><table><thead><tr><th>Compétence</th><th>Base</th><th>Points</th><th>Jet</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  }).join('');
  const weapons = sheet.weapons.map((weapon) => `<tr><td>${escapeHtml(weapon.name)}</td><td>${weapon.contactScore ? rollButton(weapon.contactScore, `${weapon.name} au contact`) : '—'}</td><td>${weapon.distanceScore ? rollButton(weapon.distanceScore, `${weapon.name} à distance`) : '—'}</td><td>${escapeHtml(weapon.damage)}</td></tr>`).join('');
  const spells = sheet.spells.map((spell) => `<li><strong>${escapeHtml(spell.name)}</strong><span>${spell.points} point${spell.points > 1 ? 's' : ''}${spell.checked ? ' · expérience ✓' : ''}</span></li>`).join('');
  return `<section class="playable-sheet"><header><div><p>${escapeHtml(sheet.player || 'Joueur')} · ${escapeHtml(sheet.race || 'Race')}</p><h2>${escapeHtml(sheet.name)}</h2><span>${escapeHtml(sheet.profession)}</span></div><div class="sheet-roll-controls"><label>Difficulté<select id="sheet-difficulty"><option value="automatic">Automatique</option><option value="easy">Facile</option><option value="normal" selected>Normale</option><option value="hard">Difficile</option><option value="impossible">Impossible</option></select></label><label class="hidden-roll-toggle"><input id="sheet-hidden-roll" type="checkbox"> Jet caché aux autres joueurs et aux overlays</label><output id="sheet-roll-result" class="sheet-roll-result">Cliquez sur un score pour lancer le D100.</output></div></header>
    <div class="play-stats">${sheet.stats.map((stat) => `<button type="button" data-sheet-roll="${stat.score * 5}" data-roll-label="${stat.label}"><span>${stat.label}</span><strong>${stat.score}</strong><small>${stat.score * 5}%</small></button>`).join('')}</div>
    <div class="derived-stats"><span><b>${sheet.hp}</b> PV</span><span><b>${sheet.powerPoints}</b> PP</span><span><b>${sheet.movement}</b> MOUV</span><span><b>${sheet.course}%</b> COURSE</span><span><b>${escapeHtml(sheet.armorPoints || '—')}</b> ARMURE</span></div>
    <section class="play-section skills-section"><div class="section-title"><h3>Compétences</h3><input id="sheet-skill-search" type="search" placeholder="Filtrer les compétences…"></div><div class="skill-groups">${skillGroups}</div></section>
    <section class="play-section"><h3>Armes</h3><div class="table-scroll"><table><thead><tr><th>Arme</th><th>Contact</th><th>Distance</th><th>Dégâts</th></tr></thead><tbody>${weapons || '<tr><td colspan="4">Aucune arme</td></tr>'}</tbody></table></div></section>
    ${spells ? `<section class="play-section"><h3>Sorts et pouvoirs</h3><ul class="spell-list">${spells}</ul></section>` : ''}
    <section class="play-section sheet-history" hidden><h3>Historique des jets — MJ</h3><div id="sheet-roll-history"><p class="muted">Chargement…</p></div></section><div class="sheet-notes">${infoBlock('Armure', [sheet.armorType, sheet.armorPoints].filter(Boolean).join(' · '))}${infoBlock('Pouvoirs', sheet.powers)}${infoBlock('Équipement et richesse', sheet.equipment)}${infoBlock('Origine', sheet.origin)}${infoBlock('Liens avec les PNJ', sheet.npcLinks)}${infoBlock('Liens avec les factions', sheet.factionLinks)}${infoBlock('Motivation', sheet.motivation)}${infoBlock('Notes de jeu', sheet.notes)}</div>
  </section>`;
}

async function refreshSheetRollHistory(session: SessionState): Promise<void> {
  const target = document.querySelector<HTMLElement>('#sheet-roll-history');
  if (!target) return;
  const section = target.closest<HTMLElement>('.sheet-history');
  if (!session.room) {
    section?.remove();
    return;
  }
  try {
    if (!await cloud.isRoomOwner(session.room)) {
      section?.remove();
      return;
    }
    if (section) section.hidden = false;
    const rolls = await cloud.rolls(session.room);
    target.innerHTML = rolls.length ? rolls.slice(0, 20).map((roll) => `<article><strong>${roll.total}</strong><span>${escapeHtml(roll.player_name)} · ${escapeHtml(roll.expression)}${roll.is_hidden ? ' · 🔒 caché' : ''}</span><time>${new Date(roll.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time></article>`).join('') : '<p class="muted">Aucun jet enregistré dans cette room.</p>';
  } catch (error) {
    target.innerHTML = `<p class="error-message">${escapeHtml(error instanceof Error ? error.message : 'Historique indisponible.')}</p>`;
  }
}
