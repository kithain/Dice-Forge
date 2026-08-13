import './styles.css';

import { fetchSystemStatus } from './api.js';
import { api, escapeHtml } from './http.js';
import { publishRollToObsRelay } from './obs-relay.js';
import { RealtimeClient } from './realtime.js';
import { SessionStore } from './session-store.js';
import { renderBattlemap } from './views/battlemap.js';
import { renderTracker } from './views/tracker.js';
import { renderDisplay } from './views/display.js';
import { evaluateBrpTest, parseDiceExpression, rollDice, type BrpDifficulty, type BrpTest, type DiceExpression, type DiceRoll } from '../shared/dice.js';
import type { ServiceStatus } from '../shared/contracts.js';
import type { RoomNpc } from '../shared/room-npcs.js';
import type { ObsidianEntry } from '../server/services/obsidian-service.js';
import { playableSheet, PLAYABLE_SKILL_GROUPS, structuredSheetToMarkdown, type PlayableSkill } from '../shared/sheet.js';

type ViewId = 'dashboard' | 'dice' | 'tracker' | 'battlemap' | 'characters' | 'references';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Conteneur principal introuvable.');

app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="#dice"><span>DF</span><strong>Dice Forge <small>V2</small></strong></a>
      <div class="session-fields">
        <label>Joueur <input id="player-name" autocomplete="nickname" maxlength="40"></label>
        <label>Room <input id="room-code" autocomplete="off" maxlength="6"></label>
      </div>
      <div class="connection"><i id="connection-dot"></i><span id="connection-label">Connexion…</span></div>
    </header>
    <aside class="sidebar">
      <p>Session</p>
      <button data-view="dashboard" data-mj-only hidden>Vue d’ensemble</button>
      <button data-view="dice">Dés</button>
      <button data-view="tracker" data-mj-only hidden>Initiative</button>
      <button data-view="battlemap">Battle Map</button>
      <button data-view="characters" data-player-only>Personnages</button>
      <button data-view="references">Références</button>
      <div class="sidebar-note" data-mj-only hidden><strong>Espace MJ</strong><span>Contrôle de la partie et des écrans.</span></div>
    </aside>
    <main id="workspace" tabindex="-1"></main>
  </div>
  <div class="toast" id="toast" role="status"></div>
`;

const workspace = document.querySelector<HTMLElement>('#workspace')!;
const playerInput = document.querySelector<HTMLInputElement>('#player-name')!;
const roomInput = document.querySelector<HTMLInputElement>('#room-code')!;
const connectionDot = document.querySelector<HTMLElement>('#connection-dot')!;
const connectionLabel = document.querySelector<HTMLElement>('#connection-label')!;
const toast = document.querySelector<HTMLElement>('#toast')!;
const session = new SessionStore();
const realtime = new RealtimeClient();
let toastTimer = 0;
let currentView: ViewId = 'dice';
let isMj = false;
let accessRefreshTimer = 0;
let lastAccessRoom = '';
const displayPath = ['/view', '/portrait_view', '/overlays/map', '/overlays/dice', '/overlays/history', '/overlays/rolls'].includes(location.pathname) ? location.pathname : '';

function showToast(message: string, error = false): void {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2400);
}

function statusCard(service: ServiceStatus): string {
  return `<article class="status-card ${service.state}"><i></i><div><strong>${service.label}</strong><span>${service.detail}</span></div></article>`;
}

async function dashboardView(): Promise<void> {
  workspace.innerHTML = `
    <section class="hero"><div><p class="eyebrow">Centre de contrôle</p><h1>Une base neuve pour toute la table.</h1><p>Le cockpit, les données et le temps réel partagent désormais les mêmes contrats TypeScript.</p></div><div class="toolbar"><button id="end-session">Fin de partie</button><button class="primary" data-go="dice">Lancer les dés</button></div></section>
    <section><div class="section-title"><div><p class="eyebrow">Diagnostic</p><h2>Services de la session</h2></div><button class="secondary" id="refresh-status">Actualiser</button></div><div class="status-grid" id="status-grid"><p class="muted">Vérification…</p></div></section>
    <section><p class="eyebrow">Migration</p><h2>Modules V2</h2><div class="module-grid"><article><b>01</b><strong>Dés</strong><span>Module natif opérationnel</span></article><article><b>02</b><strong>Tracker</strong><span>Contrat prêt à migrer</span></article><article><b>03</b><strong>Battle Map</strong><span>État V1 détecté</span></article><article><b>04</b><strong>Personnages</strong><span>Connexion Supabase prévue</span></article></div></section>
  `;
  document.querySelector('[data-go="dice"]')?.addEventListener('click', () => navigate('dice'));
  document.querySelector<HTMLButtonElement>('#end-session')?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const room = session.value.room;
    if (!room) return showToast('Renseignez la room avant de terminer la partie.', true);
    button.disabled = true;
    void import('./cloud.js').then(({ cloud }) => cloud.revealHiddenExperience(room)).then((count) => showToast(`Fin de partie : ${count} coche${count > 1 ? 's' : ''} d’expérience révélée${count > 1 ? 's' : ''}.`)).catch((error: Error) => showToast(error.message, true)).finally(() => { button.disabled = false; });
  });
  document.querySelector('#refresh-status')?.addEventListener('click', () => void loadStatus());
  await loadStatus();
}

async function loadStatus(): Promise<void> {
  const grid = document.querySelector<HTMLElement>('#status-grid');
  if (!grid) return;
  grid.innerHTML = '<p class="muted">Vérification…</p>';
  try {
    const status = await fetchSystemStatus();
    grid.innerHTML = status.services.map(statusCard).join('');
  } catch (error) {
    grid.innerHTML = `<p class="error-message">${error instanceof Error ? error.message : 'Erreur inconnue'}</p>`;
  }
}

function formatRoll(roll: DiceRoll): string {
  const details = roll.results.map((result) => {
    const sign = result.sign === -1 ? '− ' : '';
    return `${sign}D${result.sides} [${result.values.join(', ')}]`;
  }).join(' · ');
  const modifier = roll.modifier ? ` · modificateur ${roll.modifier > 0 ? '+' : ''}${roll.modifier}` : '';
  return `${details}${modifier}`;
}

function diceView(): void {
  const roleRollForm = isMj
    ? `<section class="npc-room-panel">
        <div class="section-title"><div><p class="eyebrow">Room ${escapeHtml(session.value.room || '—')}</p><h2>Ennemis et PNJ</h2></div><span>Un clic sur Attaque ou Défense lance le D100.</span></div>
        <div class="npc-quick-list" id="npc-room-list"><p class="muted">Chargement…</p></div>
        <form id="npc-library-form" class="npc-library-form">
          <div><label for="npc-source">Importer d’Obsidian</label><select id="npc-source"><option value="">PNJ personnalisé</option></select></div>
          <div><label for="npc-name">Nom</label><input id="npc-name" maxlength="80" placeholder="Ex. Garde orque" required></div>
          <div><label for="npc-melee-attack">Attaque CaC (%)</label><input id="npc-melee-attack" type="number" min="0" max="100" value="50" required></div>
          <div><label for="npc-ranged-attack">Attaque distance (%)</label><input id="npc-ranged-attack" type="number" min="0" max="100" value="0" required></div>
          <div><label for="npc-defense">Défense (%)</label><input id="npc-defense" type="number" min="1" max="100" value="50" required></div>
          <button class="primary">Ajouter à la room</button>
        </form>
      </section>`
    : `<form id="skill-roll-form" class="brp-form skill-roll-form"><div><label for="skill-roll-select">Compétence de la fiche</label><select id="skill-roll-select" disabled><option>Chargement de la fiche…</option></select><small id="skill-roll-detail">Connectez-vous pour charger vos compétences.</small></div><div><label for="skill-roll-difficulty">Difficulté</label><select id="skill-roll-difficulty"><option value="automatic">Automatique</option><option value="easy">Facile</option><option value="normal" selected>Normale</option><option value="hard">Difficile</option><option value="impossible">Impossible</option></select></div><button disabled>Tester la compétence</button></form>`;
  workspace.innerHTML = `
    <section class="tool-header"><div><p class="eyebrow">${isMj ? 'Espace MJ' : 'Module natif'}</p><h1>Lanceur de dés</h1><p>${isMj ? 'Lancez les actions des ennemis et PNJ sans créer de fiche de personnage.' : 'Expressions acceptées : 2D6 + 1D8 + 5, D100 ou 1D20 − 2.'}</p></div></section>
    <section class="dice-panel">
      <form id="dice-form"><label for="dice-expression">Expression</label><div><input id="dice-expression" value="1D100" autocomplete="off"><button class="primary">Lancer</button></div><label class="check-line"><input id="hidden-roll" type="checkbox"> Jet caché aux autres joueurs et aux overlays</label></form>
      <div class="quick-dice">${[4, 6, 8, 10, 12, 20, 100].map((side) => `<button data-die="${side}">D${side}</button>`).join('')}</div>
      ${roleRollForm}
      <form id="brp-form" class="brp-form"><div><label for="brp-score">Test BRP (%)</label><input id="brp-score" type="number" min="1" max="100" value="60" required></div><div><label for="brp-difficulty">Difficulté</label><select id="brp-difficulty"><option value="automatic">Automatique</option><option value="easy">Facile</option><option value="normal" selected>Normale</option><option value="hard">Difficile</option><option value="impossible">Impossible</option></select></div><button>Tester au D100</button></form>
      <article class="roll-result empty" id="roll-result"><span>Le résultat apparaîtra ici.</span></article><div class="cloud-rolls" id="cloud-rolls"></div>
    </section>
  `;
  const form = document.querySelector<HTMLFormElement>('#dice-form')!;
  const input = document.querySelector<HTMLInputElement>('#dice-expression')!;
  const result = document.querySelector<HTMLElement>('#roll-result')!;
  const difficultyLabels: Record<BrpDifficulty, string> = { automatic: 'Automatique', easy: 'Facile', normal: 'Normale', hard: 'Difficile', impossible: 'Impossible' };
  const loadHistory = async (): Promise<void> => {
    const activeSession = session.value;
    const target = document.querySelector<HTMLElement>('#cloud-rolls');
    if (!target || !activeSession.room || !activeSession.playerName) return;
    try {
      const { cloud } = await import('./cloud.js');
      if (!await cloud.isRoomOwner(activeSession.room)) {
        target.hidden = true;
        target.replaceChildren();
        return;
      }
      target.hidden = false;
      const history = await cloud.rolls(activeSession.room);
      target.innerHTML = `<h2>Historique de la room</h2>${history.length ? history.map((item) => `<div><strong>${item.total}</strong><span>${escapeHtml(item.player_name)} · ${escapeHtml(item.expression)}${item.is_hidden ? ' · 🔒 caché' : ''}</span></div>`).join('') : '<p class="muted">Aucun jet enregistré.</p>'}`;
    } catch {
      target.innerHTML = '<p class="muted">Connectez-vous dans Personnages pour consulter l’historique de la room.</p>';
    }
  };
  const publishRoll = (roll: DiceRoll): void => {
    const activeSession = session.value;
    if (!activeSession.room || !activeSession.playerName) return;
    void import('./cloud.js').then(async ({ cloud }) => {
      await cloud.saveRoll(activeSession, roll);
      void publishRollToObsRelay(activeSession, roll, 'dice_forge_v2:dice');
      showToast(`Jet envoyé dans la room ${activeSession.room}.`);
      await loadHistory();
    }).catch((error: Error) => showToast(error.message, true));
  };
  const hiddenRoll = async (expression: DiceExpression, label = expression.source, experience?: { skill: string; difficulty: BrpDifficulty }) => {
    const activeSession = session.value;
    if (!activeSession.room || !activeSession.playerName) throw new Error('Renseignez le joueur et la room avant un jet caché.');
    const { cloud } = await import('./cloud.js');
    const hidden = await cloud.rollHidden(activeSession, expression, label, experience);
    await loadHistory();
    if (!hidden.is_owner) {
      result.classList.remove('empty');
      result.innerHTML = `<small>${escapeHtml(label)}</small><strong>🔒</strong><span>Jet transmis. Seul le créateur de la room peut voir le résultat.</span>`;
      showToast('Jet caché envoyé au MJ.');
    }
    return hidden;
  };
  const displayBrp = (test: BrpTest, expression: string): void => {
    const outcomeLabels = { critical: 'Réussite critique', special: 'Réussite spéciale', success: 'Réussite', failure: 'Échec', fumble: 'Maladresse' } as const;
    result.classList.remove('empty');
    result.innerHTML = `<small>${escapeHtml(expression)}</small><strong>${test.roll ?? '—'}</strong><span class="brp-outcome ${test.outcome}">${outcomeLabels[test.outcome]}</span><span>Seuil ${test.threshold}% · spéciale ≤ ${test.specialLimit} · critique ≤ ${test.criticalLimit} · maladresse ≥ ${test.fumbleMinimum}</span>`;
  };
  const runNpcRoll = async (npc: RoomNpc, action: 'Attaque CaC' | 'Attaque distance' | 'Défense'): Promise<void> => {
    const score = action === 'Attaque CaC' ? npc.meleeAttack : action === 'Attaque distance' ? npc.rangedAttack : npc.defense;
    if (score < 1) throw new Error(`${npc.name} n’a pas de valeur d’${action.toLowerCase()}.`);
    const difficulty: BrpDifficulty = 'normal';
    const label = `${npc.name} · ${action} ${score}%`;
    const diceExpression: DiceExpression = { source: label, dice: [{ count: 1, sides: 100, sign: 1 }], modifier: 0 };
    if (document.querySelector<HTMLInputElement>('#hidden-roll')?.checked) {
      const hidden = await hiddenRoll(diceExpression, label);
      if (hidden.total !== null) displayBrp(evaluateBrpTest(score, difficulty, () => hidden.total!), label);
      return;
    }
    const test = evaluateBrpTest(score, difficulty);
    const roll: DiceRoll = { expression: label, results: [{ count: 1, sides: 100, sign: 1, values: [test.roll!], subtotal: test.roll! }], modifier: 0, total: test.roll! };
    displayBrp(test, label);
    publishRoll(roll);
  };
  const renderRoomNpcs = (npcs: RoomNpc[]): void => {
    const target = document.querySelector<HTMLElement>('#npc-room-list');
    if (!target) return;
    target.innerHTML = npcs.length ? npcs.map((npc) => `<article class="npc-quick-card" data-room-npc="${escapeHtml(npc.id)}"><div><strong>${escapeHtml(npc.name)}</strong><small>${npc.source ? 'Obsidian' : 'Personnalisé'}</small></div><button data-npc-roll="melee" ${npc.meleeAttack ? '' : 'disabled'}><span>CaC</span><b>${npc.meleeAttack ? `${npc.meleeAttack}%` : '—'}</b></button><button data-npc-roll="ranged" ${npc.rangedAttack ? '' : 'disabled'}><span>Distance</span><b>${npc.rangedAttack ? `${npc.rangedAttack}%` : '—'}</b></button><button data-npc-roll="defense"><span>Défense</span><b>${npc.defense}%</b></button><button class="danger npc-remove" data-npc-remove title="Retirer de la room">×</button></article>`).join('') : '<p class="muted">Aucun PNJ défini pour cette room. Importez-en un depuis Obsidian ou créez-le ci-dessous.</p>';
    target.querySelectorAll<HTMLElement>('[data-room-npc]').forEach((card) => {
      const npc = npcs.find((item) => item.id === card.dataset.roomNpc)!;
      card.querySelector<HTMLButtonElement>('[data-npc-roll="melee"]')?.addEventListener('click', () => void runNpcRoll(npc, 'Attaque CaC').catch((error: Error) => showToast(error.message, true)));
      card.querySelector<HTMLButtonElement>('[data-npc-roll="ranged"]')?.addEventListener('click', () => void runNpcRoll(npc, 'Attaque distance').catch((error: Error) => showToast(error.message, true)));
      card.querySelector<HTMLButtonElement>('[data-npc-roll="defense"]')?.addEventListener('click', () => void runNpcRoll(npc, 'Défense').catch((error: Error) => showToast(error.message, true)));
      card.querySelector<HTMLButtonElement>('[data-npc-remove]')?.addEventListener('click', () => {
        const room = session.value.room;
        void api<{ npcs: RoomNpc[] }>(`/api/rooms/${encodeURIComponent(room)}/npcs/${encodeURIComponent(npc.id)}`, { method: 'DELETE' }).then((payload) => renderRoomNpcs(payload.npcs)).catch((error: Error) => showToast(error.message, true));
      });
    });
  };
  const loadRoomNpcs = async (): Promise<void> => {
    const room = session.value.room;
    const target = document.querySelector<HTMLElement>('#npc-room-list');
    const submit = document.querySelector<HTMLButtonElement>('#npc-library-form button');
    if (!target) return;
    if (!room) {
      target.innerHTML = '<p class="muted">Renseignez un code de room pour constituer sa liste de PNJ.</p>';
      if (submit) submit.disabled = true;
      return;
    }
    const payload = await api<{ npcs: RoomNpc[] }>(`/api/rooms/${encodeURIComponent(room)}/npcs`);
    renderRoomNpcs(payload.npcs);
  };
  const loadNpcCatalog = async (): Promise<void> => {
    const select = document.querySelector<HTMLSelectElement>('#npc-source');
    if (!select) return;
    const payload = await api<{ entries: ObsidianEntry[] }>('/api/obsidian');
    const entries = payload.entries.filter((entry) => entry.source_type !== 'pj');
    select.insertAdjacentHTML('beforeend', entries.map((entry, index) => `<option value="${index}">${escapeHtml(entry.name)} — CaC ${entry.melee_attack || '—'} / Dist. ${entry.ranged_attack || '—'} / Déf. ${entry.defense}%</option>`).join(''));
    select.addEventListener('change', () => {
      const entry = entries[Number(select.value)];
      if (!entry) return;
      document.querySelector<HTMLInputElement>('#npc-name')!.value = entry.name;
      document.querySelector<HTMLInputElement>('#npc-melee-attack')!.value = String(entry.melee_attack);
      document.querySelector<HTMLInputElement>('#npc-ranged-attack')!.value = String(entry.ranged_attack);
      document.querySelector<HTMLInputElement>('#npc-defense')!.value = String(entry.defense);
    });
    document.querySelector<HTMLFormElement>('#npc-library-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const room = session.value.room;
      if (!room) return showToast('Renseignez un code de room.', true);
      const selected = entries[Number(select.value)];
      const body = {
        name: document.querySelector<HTMLInputElement>('#npc-name')!.value,
        meleeAttack: Number(document.querySelector<HTMLInputElement>('#npc-melee-attack')!.value),
        rangedAttack: Number(document.querySelector<HTMLInputElement>('#npc-ranged-attack')!.value),
        defense: Number(document.querySelector<HTMLInputElement>('#npc-defense')!.value),
        source: selected?.source ?? '',
      };
      void api<{ npcs: RoomNpc[] }>(`/api/rooms/${encodeURIComponent(room)}/npcs`, { method: 'POST', body: JSON.stringify(body) }).then((saved) => {
        renderRoomNpcs(saved.npcs);
        showToast(`${body.name} ajouté à la room ${room}.`);
      }).catch((error: Error) => showToast(error.message, true));
    });
  };
  const loadSkills = async (): Promise<void> => {
    const select = document.querySelector<HTMLSelectElement>('#skill-roll-select');
    const submit = document.querySelector<HTMLButtonElement>('#skill-roll-form button[type="submit"], #skill-roll-form > button');
    const detail = document.querySelector<HTMLElement>('#skill-roll-detail');
    if (!select || !submit || !detail) return;
    try {
      const { cloud } = await import('./cloud.js');
      const record = await cloud.sheet(session.value);
      if (!record) throw new Error('Aucune fiche dans cette room.');
      const model = playableSheet(record.sheet_data, record.character_name);
      const eligibleSkills = model.skills.filter((skill) => skill.score >= 1 && skill.score <= 100);
      select.innerHTML = PLAYABLE_SKILL_GROUPS.map((group) => {
        const options = eligibleSkills.filter((skill) => skill.group === group).map((skill) => `<option value="${escapeHtml(skill.name)}">${escapeHtml(skill.name)} — ${skill.score}%</option>`).join('');
        return options ? `<optgroup label="${escapeHtml(group)}">${options}</optgroup>` : '';
      }).join('');
      select.disabled = !eligibleSkills.length;
      submit.disabled = select.disabled;
      const updateDetail = () => {
        const skill = model.skills.find((item) => item.name === select.value);
        detail.textContent = skill ? `Base ${skill.base} + ${skill.points} points = ${skill.score}%${skill.checked ? ' · expérience déjà cochée' : ''}` : 'Aucune compétence disponible.';
      };
      select.addEventListener('change', updateDetail);
      updateDetail();
    } catch (error) {
      select.innerHTML = '<option>Fiche indisponible</option>';
      detail.textContent = error instanceof Error ? error.message : 'Impossible de charger la fiche.';
    }
  };
  const markSkillExperience = async (skillName: string): Promise<boolean> => {
    const activeSession = session.value;
    const { cloud } = await import('./cloud.js');
    const record = await cloud.sheet(activeSession);
    if (!record) return false;
    const skills = Array.isArray(record.sheet_data.skills) ? record.sheet_data.skills as Array<Record<string, unknown>> : [];
    const skill = skills.find((item) => String(item.name || '') === skillName);
    if (!skill || skill.checked) return false;
    skill.checked = true;
    await cloud.saveSheet(activeSession, { character_name: record.character_name, sheet_data: record.sheet_data, markdown_content: structuredSheetToMarkdown(record.sheet_data, record.character_name) }, record.player_name);
    return true;
  };
  document.querySelectorAll<HTMLButtonElement>('[data-die]').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = `1D${button.dataset.die}`;
      form.requestSubmit();
    });
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      const expression = parseDiceExpression(input.value);
      if (document.querySelector<HTMLInputElement>('#hidden-roll')?.checked) {
        const hidden = await hiddenRoll(expression);
        if (hidden.is_owner && hidden.total !== null) {
          result.classList.remove('empty');
          result.innerHTML = `<small>${expression.source} · jet caché MJ</small><strong>${hidden.total}</strong><span>${escapeHtml(hidden.rolls_detail || '')}</span>`;
        }
        return;
      }
      const roll = rollDice(expression);
      result.classList.remove('empty');
      result.innerHTML = `<small>${roll.expression}</small><strong>${roll.total}</strong><span>${formatRoll(roll)}</span>`;
      publishRoll(roll);
    })().catch((error: Error) => showToast(error.message || 'Jet impossible.', true));
  });
  document.querySelector<HTMLFormElement>('#skill-roll-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      const select = document.querySelector<HTMLSelectElement>('#skill-roll-select')!;
      const difficulty = document.querySelector<HTMLSelectElement>('#skill-roll-difficulty')!.value as BrpDifficulty;
      const { cloud } = await import('./cloud.js');
      const record = await cloud.sheet(session.value);
      if (!record) throw new Error('Aucune fiche dans cette room.');
      const skill = playableSheet(record.sheet_data, record.character_name).skills.find((item) => item.name === select.value) as PlayableSkill | undefined;
      if (!skill) throw new Error('Compétence introuvable dans la fiche.');
      const label = `${skill.name} ${skill.score}% · ${difficultyLabels[difficulty]}`;
      const expression: DiceExpression = { source: label, dice: difficulty === 'automatic' || difficulty === 'impossible' ? [] : [{ count: 1, sides: 100, sign: 1 }], modifier: difficulty === 'impossible' ? 100 : 0 };
      if (document.querySelector<HTMLInputElement>('#hidden-roll')?.checked) {
        const hidden = await hiddenRoll(expression, label, expression.dice.length ? { skill: skill.name, difficulty } : undefined);
        if (hidden.is_owner && hidden.total !== null) displayBrp(evaluateBrpTest(skill.score, difficulty, () => hidden.total!), label);
        return;
      }
      const test = evaluateBrpTest(skill.score, difficulty);
      displayBrp(test, label);
      const roll: DiceRoll = { expression: label, results: test.roll === null ? [] : [{ count: 1, sides: 100, sign: 1, values: [test.roll], subtotal: test.roll }], modifier: 0, total: test.roll ?? (test.outcome === 'success' ? 0 : 100) };
      await cloud.saveRoll(session.value, roll);
      void publishRollToObsRelay(session.value, roll, 'dice_forge_v2:skill');
      if (test.roll !== null && ['critical', 'special', 'success'].includes(test.outcome) && await markSkillExperience(skill.name)) {
        showToast('Réussite : expérience cochée et enregistrée.');
        await loadSkills();
      }
      await loadHistory();
    })().catch((error: Error) => showToast(error.message || 'Jet de compétence impossible.', true));
  });
  document.querySelector<HTMLFormElement>('#brp-form')!.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      const score = Number(document.querySelector<HTMLInputElement>('#brp-score')!.value);
      const difficulty = document.querySelector<HTMLSelectElement>('#brp-difficulty')!.value as BrpDifficulty;
      const expression = `Test BRP ${score}% · ${difficultyLabels[difficulty]}`;
      if (document.querySelector<HTMLInputElement>('#hidden-roll')?.checked) {
        const automaticModifier = difficulty === 'impossible' ? 100 : 0;
        const diceExpression: DiceExpression = { source: expression, dice: difficulty === 'automatic' || difficulty === 'impossible' ? [] : [{ count: 1, sides: 100, sign: 1 }], modifier: automaticModifier };
        const hidden = await hiddenRoll(diceExpression, expression);
        if (hidden.is_owner && hidden.total !== null) displayBrp(evaluateBrpTest(score, difficulty, () => hidden.total!), expression);
        return;
      }
      const test = evaluateBrpTest(score, difficulty);
      const roll: DiceRoll = { expression, results: test.roll === null ? [] : [{ count: 1, sides: 100, sign: 1, values: [test.roll], subtotal: test.roll }], modifier: 0, total: test.roll ?? (test.outcome === 'success' ? 0 : 100) };
      displayBrp(test, expression);
      publishRoll(roll);
    })().catch((error: Error) => showToast(error.message || 'Test BRP impossible.', true));
  });
  void loadHistory();
  if (isMj) {
    void loadRoomNpcs().catch((error: Error) => showToast(error.message, true));
    void loadNpcCatalog().catch((error: Error) => showToast(`Catalogue Obsidian indisponible : ${error.message}`, true));
  } else void loadSkills();
}

function navigate(view: ViewId): void {
  if ((view === 'dashboard' || view === 'tracker') && !isMj) view = 'dice';
  if (view === 'characters' && isMj) view = 'dice';
  currentView = view;
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  history.replaceState(null, '', `#${view}`);
  if (view === 'dashboard') void dashboardView();
  if (view === 'dice') diceView();
  if (view === 'tracker') void renderTracker(workspace, showToast).catch((error) => showToast(error.message, true));
  if (view === 'battlemap') void renderBattlemap(workspace, showToast, isMj).catch((error) => showToast(error.message, true));
  if (view === 'characters') void import('./views/characters.js').then(({ renderCharacters }) => renderCharacters(workspace, session, showToast)).catch((error) => showToast(error.message, true));
  if (view === 'references') void import('./views/references.js').then(({ renderReferences }) => renderReferences(workspace));
  workspace.focus();
}

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
  button.addEventListener('click', () => navigate(button.dataset.view as ViewId));
});
playerInput.addEventListener('change', () => session.update({ playerName: playerInput.value }));
roomInput.addEventListener('input', () => session.update({ room: roomInput.value }));
session.subscribe((state) => {
  playerInput.value = state.playerName;
  roomInput.value = state.room;
  realtime.sendSession(state);
  window.clearTimeout(accessRefreshTimer);
  accessRefreshTimer = window.setTimeout(() => void refreshAccess(), 250);
});
window.addEventListener('diceforge-auth-changed', () => void refreshAccess());
realtime.addEventListener('connected', () => {
  connectionDot.classList.add('online');
  connectionLabel.textContent = 'Serveur local';
  realtime.sendSession(session.value);
});
realtime.addEventListener('disconnected', () => {
  connectionDot.classList.remove('online');
  connectionLabel.textContent = 'Reconnexion…';
});
realtime.addEventListener('message', (event) => {
  const message = (event as CustomEvent<{ type: string }>).detail;
  if (displayPath && ['combat.changed', 'battlemap.changed'].includes(message.type)) void renderDisplay(workspace, displayPath);
  if (message.type === 'combat.changed' && currentView === 'tracker') void renderTracker(workspace, showToast);
  if (message.type === 'battlemap.changed' && currentView === 'battlemap') void renderBattlemap(workspace, showToast, isMj);
});

async function refreshAccess(): Promise<void> {
  const activeSession = session.value;
  const roomChanged = lastAccessRoom !== activeSession.room;
  lastAccessRoom = activeSession.room;
  let owner = false;
  if (activeSession.room) {
    try {
      const { cloud } = await import('./cloud.js');
      owner = await cloud.isRoomOwner(activeSession.room);
    } catch {
      owner = false;
    }
  }
  const roleChanged = isMj !== owner;
  isMj = owner;
  document.querySelectorAll<HTMLElement>('[data-mj-only]').forEach((element) => { element.hidden = !owner; });
  document.querySelectorAll<HTMLElement>('[data-player-only]').forEach((element) => { element.hidden = owner; });
  if (!owner && (currentView === 'dashboard' || currentView === 'tracker')) navigate('dice');
  else if (owner && currentView === 'characters') navigate('dice');
  else if ((roleChanged || roomChanged) && currentView === 'dice') diceView();
  if (currentView === 'battlemap') void renderBattlemap(workspace, showToast, owner);
}

realtime.connect();
if (displayPath) void renderDisplay(workspace, displayPath).catch((error) => showToast(error.message, true));
else {
  const initialView = location.hash.slice(1) as ViewId;
  navigate(['dice', 'battlemap', 'characters', 'references'].includes(initialView) ? initialView : 'dice');
}
