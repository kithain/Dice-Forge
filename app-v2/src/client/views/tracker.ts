import { STATUS_EFFECTS, type CombatState, type Participant, type ParticipantStatus } from '../../shared/combat.js';
import type { ObsidianEntry } from '../../server/services/obsidian-service.js';
import { api, escapeHtml } from '../http.js';

type Notify = (message: string, error?: boolean) => void;

function statusOptions(): string {
  return STATUS_EFFECTS.map((status) => `<option value="${status}">${status}</option>`).join('');
}

function participantCard(participant: Participant, active: boolean): string {
  const statuses = participant.statuses.map((status) => `<button class="status-chip" data-remove-status="${escapeHtml(status.name)}">${escapeHtml(status.name)}${status.duration ? ` · ${status.duration}` : ''} ×</button>`).join('');
  return `<article class="participant ${active ? 'active' : ''}" data-participant="${participant.id}">
    <div class="participant-order"><span>${participant.token_number}</span><small>DEX ${participant.dexterity}</small></div>
    <div class="participant-main"><div><strong>${escapeHtml(participant.name)}</strong><span>${participant.role}${active ? ' · Tour actif' : ''}</span></div><div class="status-row">${statuses}</div></div>
    <div class="hp-control"><button data-hp="-1">−</button><b>${participant.hp} / ${participant.hp_max}</b><button data-hp="1">+</button></div>
    <div class="participant-actions"><select data-status>${statusOptions()}</select><input data-duration type="number" min="1" placeholder="∞"><button data-add-status>État</button><button class="danger" data-remove>Suppr.</button></div>
  </article>`;
}

async function mutate(path: string, method: string, body?: unknown): Promise<CombatState> {
  return api<CombatState>(path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
}

export async function renderTracker(workspace: HTMLElement, notify: Notify): Promise<void> {
  const [combat, encounters] = await Promise.all([
    api<CombatState>('/api/combat'),
    api<{ encounters: string[] }>('/api/encounters'),
  ]);
  workspace.innerHTML = `<section class="tool-header compact"><div><p class="eyebrow">Combat local</p><h1>Tracker d’initiative</h1><p>Round ${combat.round_number} · ${combat.participants.length} combattant(s)</p></div><div class="toolbar"><button id="sort-combat">Trier</button><button id="restart-combat">Recommencer</button><button class="primary" id="next-turn">Tour suivant</button></div></section>
    <section class="tracker-layout"><div>
      <div class="participants">${combat.participants.map((participant, index) => participantCard(participant, index === combat.current_turn_index)).join('') || '<p class="empty-state">Ajoutez un premier combattant.</p>'}</div>
      <form class="inline-form" id="add-participant"><input name="name" required placeholder="Nom"><select name="role"><option value="player">PJ</option><option value="ally">Allié</option><option value="monster">Adversaire</option></select><input name="dexterity" type="number" min="1" value="10" title="DEX"><input name="hp_max" type="number" min="1" value="10" title="PV"><button class="primary">Ajouter</button></form>
    </div><aside class="tracker-side">
      <div class="side-card"><h2>Rencontres</h2><form id="save-encounter"><input name="name" maxlength="60" placeholder="Nom de la rencontre"><button>Enregistrer</button></form><div class="encounter-list">${encounters.encounters.map((name) => `<div><span>${escapeHtml(name)}</span><button data-load-encounter="${escapeHtml(name)}">Charger</button><button data-delete-encounter="${escapeHtml(name)}">×</button></div>`).join('') || '<small>Aucune rencontre.</small>'}</div></div>
      <div class="side-card"><h2>Importer d’Obsidian</h2><form id="search-obsidian"><input name="q" placeholder="Nom ou fichier"><button>Rechercher</button></form><div id="obsidian-results"><small>Lancez une recherche.</small></div></div>
    </aside></section>`;

  const refresh = () => renderTracker(workspace, notify);
  document.querySelector('#next-turn')?.addEventListener('click', () => void mutate('/api/combat/next', 'POST').then(refresh).catch((error) => notify(error.message, true)));
  document.querySelector('#sort-combat')?.addEventListener('click', () => void mutate('/api/combat/sort', 'POST').then(refresh).catch((error) => notify(error.message, true)));
  document.querySelector('#restart-combat')?.addEventListener('click', () => void mutate('/api/combat/restart', 'POST').then(refresh).catch((error) => notify(error.message, true)));
  document.querySelector<HTMLFormElement>('#add-participant')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement));
    void mutate('/api/combat/participants', 'POST', data).then(refresh).catch((error) => notify(error.message, true));
  });
  document.querySelectorAll<HTMLElement>('[data-participant]').forEach((card) => {
    const participant = combat.participants.find((item) => item.id === card.dataset.participant)!;
    card.querySelectorAll<HTMLButtonElement>('[data-hp]').forEach((button) => button.addEventListener('click', () => {
      void mutate(`/api/combat/participants/${participant.id}`, 'PATCH', { hp: participant.hp + Number(button.dataset.hp) }).then(refresh);
    }));
    card.querySelector<HTMLButtonElement>('[data-remove]')?.addEventListener('click', () => void mutate(`/api/combat/participants/${participant.id}`, 'DELETE').then(refresh));
    card.querySelector<HTMLButtonElement>('[data-add-status]')?.addEventListener('click', () => {
      const name = card.querySelector<HTMLSelectElement>('[data-status]')!.value;
      const rawDuration = card.querySelector<HTMLInputElement>('[data-duration]')!.value;
      const addition: ParticipantStatus = { name, duration: rawDuration ? Number(rawDuration) : null };
      void mutate(`/api/combat/participants/${participant.id}`, 'PATCH', { statuses: [...participant.statuses, addition] }).then(refresh);
    });
    card.querySelectorAll<HTMLButtonElement>('[data-remove-status]').forEach((button) => button.addEventListener('click', () => {
      void mutate(`/api/combat/participants/${participant.id}`, 'PATCH', { statuses: participant.statuses.filter((status) => status.name !== button.dataset.removeStatus) }).then(refresh);
    }));
  });
  document.querySelector<HTMLFormElement>('#save-encounter')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget as HTMLFormElement).get('name') || '');
    void api('/api/encounters', { method: 'POST', body: JSON.stringify({ name }) }).then(refresh).catch((error) => notify(error.message, true));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-load-encounter]').forEach((button) => button.addEventListener('click', () => void mutate(`/api/encounters/${encodeURIComponent(button.dataset.loadEncounter!)}/load`, 'POST').then(refresh)));
  document.querySelectorAll<HTMLButtonElement>('[data-delete-encounter]').forEach((button) => button.addEventListener('click', () => void api(`/api/encounters/${encodeURIComponent(button.dataset.deleteEncounter!)}`, { method: 'DELETE' }).then(refresh)));
  document.querySelector<HTMLFormElement>('#search-obsidian')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const q = encodeURIComponent(String(new FormData(event.currentTarget as HTMLFormElement).get('q') || ''));
    const results = document.querySelector<HTMLElement>('#obsidian-results')!;
    results.innerHTML = '<small>Recherche…</small>';
    void api<{ entries: ObsidianEntry[] }>(`/api/obsidian?q=${q}`).then((payload) => {
      results.innerHTML = payload.entries.slice(0, 30).map((entry, index) => `<button data-import-index="${index}"><strong>${escapeHtml(entry.name)}</strong><small>${entry.source_type} · DEX ${entry.dexterity} · PV ${entry.hp_max}</small></button>`).join('') || '<small>Aucun résultat.</small>';
      results.querySelectorAll<HTMLButtonElement>('[data-import-index]').forEach((button) => button.addEventListener('click', () => {
        const entry = payload.entries[Number(button.dataset.importIndex)]!;
        void mutate('/api/combat/participants', 'POST', { ...entry, role: entry.default_role, hp: entry.hp_max }).then(refresh);
      }));
    }).catch((error) => notify(error.message, true));
  });
}
