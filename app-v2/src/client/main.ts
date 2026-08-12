import './styles.css';

import { fetchSystemStatus } from './api.js';
import { escapeHtml } from './http.js';
import { publishRollToObsRelay } from './obs-relay.js';
import { RealtimeClient } from './realtime.js';
import { SessionStore } from './session-store.js';
import { renderBattlemap } from './views/battlemap.js';
import { renderTracker } from './views/tracker.js';
import { renderDisplay } from './views/display.js';
import { evaluateBrpTest, parseDiceExpression, rollDice, type BrpDifficulty, type BrpTest, type DiceExpression, type DiceRoll } from '../shared/dice.js';
import type { ServiceStatus } from '../shared/contracts.js';
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
      <button data-view="characters">Personnages</button>
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
const displayPath = ['/view', '/portrait_view', '/overlays/map', '/overlays/rolls'].includes(location.pathname) ? location.pathname : '';

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
  workspace.innerHTML = `
    <section class="tool-header"><div><p class="eyebrow">Module natif</p><h1>Lanceur de dés</h1><p>Expressions acceptées : 2D6 + 1D8 + 5, D100 ou 1D20 − 2.</p></div></section>
    <section class="dice-panel">
      <form id="dice-form"><label for="dice-expression">Expression</label><div><input id="dice-expression" value="1D100" autocomplete="off"><button class="primary">Lancer</button></div><label class="check-line"><input id="hidden-roll" type="checkbox"> Jet caché aux autres joueurs et aux overlays</label></form>
      <div class="quick-dice">${[4, 6, 8, 10, 12, 20, 100].map((side) => `<button data-die="${side}">D${side}</button>`).join('')}</div>
      <form id="skill-roll-form" class="brp-form skill-roll-form"><div><label for="skill-roll-select">Compétence de la fiche</label><select id="skill-roll-select" disabled><option>Chargement de la fiche…</option></select><small id="skill-roll-detail">Connectez-vous pour charger vos compétences.</small></div><div><label for="skill-roll-difficulty">Difficulté</label><select id="skill-roll-difficulty"><option value="automatic">Automatique</option><option value="easy">Facile</option><option value="normal" selected>Normale</option><option value="hard">Difficile</option><option value="impossible">Impossible</option></select></div><button disabled>Tester la compétence</button></form>
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
  document.querySelector<HTMLFormElement>('#skill-roll-form')!.addEventListener('submit', (event) => {
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
  void loadSkills();
}

function navigate(view: ViewId): void {
  if ((view === 'dashboard' || view === 'tracker') && !isMj) view = 'dice';
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
  let owner = false;
  if (activeSession.room) {
    try {
      const { cloud } = await import('./cloud.js');
      owner = await cloud.isRoomOwner(activeSession.room);
    } catch {
      owner = false;
    }
  }
  isMj = owner;
  document.querySelectorAll<HTMLElement>('[data-mj-only]').forEach((element) => { element.hidden = !owner; });
  if (!owner && (currentView === 'dashboard' || currentView === 'tracker')) navigate('dice');
  if (currentView === 'battlemap') void renderBattlemap(workspace, showToast, owner);
}

realtime.connect();
if (displayPath) void renderDisplay(workspace, displayPath).catch((error) => showToast(error.message, true));
else {
  const initialView = location.hash.slice(1) as ViewId;
  navigate(['dice', 'battlemap', 'characters', 'references'].includes(initialView) ? initialView : 'dice');
}
