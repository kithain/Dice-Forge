(() => {
  'use strict';
  let room = new URLSearchParams(window.location.search).get('room');
  if (room === null) {
    try { room = localStorage.getItem('diceforge_cockpit_room') || JSON.parse(localStorage.getItem('diceforge_room') || 'null')?.code || ''; } catch { room = ''; }
  }
  room = String(room).trim().toUpperCase();
  if (!/^[A-Z0-9]{4,6}$/.test(room)) room = '';
  const KEY = 'dice-forge.mj-notebook.v1' + (room ? `.${room}` : '');
  const basics = [['name','Nom'],['role','Classe / profession / rôle'],['level','Niveau (si utilisé)'],['hp','PV actuels'],['hpMax','PV maximum'],['defense','Défense / CA'],['speed','Vitesse / MOV'],['perception','Perception / perception passive'],['initiative','Initiative'],['saves','Sauvegardes importantes']];
  const sections = [
    ['Compétences', [['strengths','2–4 meilleures compétences et scores'],['weaknesses','Points faibles significatifs']]],
    ['Combat', [['attack','Attaque principale / score'],['range','Portée'],['damage','Dégâts (dés ou moyenne)'],['signature','Capacité emblématique'],['reactions','Réactions importantes'],['resistances','Résistances / immunités']]],
    ['Exploration', [['vision','Vision dans le noir / sens'],['languages','Langues'],['detection','Détection'],['survival','Survie / pistage'],['locks','Crochetage'],['utility','Magie utilitaire'],['movement','Déplacements particuliers'],['spells','Sorts de la fiche'],['armor','Armure / PA'],['equipment','Équipement et richesse']]],
    ['Social', [['persuasion','Persuasion / score'],['intimidation','Intimidation / score'],['deception','Tromperie / baratin / score'],['reputation','Réputation / titres'],['factions','Factions alliées / ennemies'],['contacts','Contacts importants']]],
    ['Narratif · notes MJ', [['objective','Objectif personnel'],['motivation','Motivation'],['secret','Secret connu du MJ'],['fear','Peur / faiblesse'],['npc','PNJ lié au personnage']]],
    ['État et suivi MJ', [['conditions','États / blessures / fatigue'],['curses','Malédictions / maladies'],['effects','Effets persistants / durée'],['hero','Inspiration / points héroïques'],['recharge','Ressources rechargeables / récupération'],['passives','Passifs faciles à oublier'],['magic','Objets magiques à surveiller']]]
  ];
  const groupSections = [
    ['Ressources du groupe', [['gold','Or total / monnaies'],['valuables','Objets de valeur importants'],['consumables','Consommables rares'],['mounts','Montures / véhicules'],['shared','Ressources communes']]],
    ['Informations de campagne', [['quest','Quête principale actuelle'],['sidequests','Quêtes secondaires actives'],['debts','Promesses / dettes'],['enemies','Ennemis récurrents'],['wanted','Personnes recherchées']]],
    ['État du groupe', [['conditions','Conditions temporaires et personnages concernés'],['afflictions','Malédictions / maladies / blessures / fatigue'],['persistent','Effets persistants / échéances']]],
    ['Repères sociaux et suivi MJ', [['speakers','Meilleurs PJ en persuasion / intimidation / tromperie'],['relationships','Réputation / factions / contacts du groupe'],['reminders','Rappels de séance / passifs / objets à surveiller']]]
  ];
  const $ = id => document.getElementById(id);
  const pjKeys = [...basics, ...sections.flatMap(([,fields]) => fields)].map(([key]) => key).concat(['sourceId','sourceRoom','sourceSnapshot','sourcePlayer']);
  const groupKeys = groupSections.flatMap(([,fields]) => fields).map(([key]) => key);
  let state = { version: 1, campaign: '', characters: [], group: {} };
  function cleanFields(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Champs invalides');
    const result = {};
    for (const key of keys) {
      if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > (key === 'sourceSnapshot' ? 1000000 : 20000))) throw new Error('Champ invalide');
      result[key] = value[key] || '';
    }
    return result;
  }
  function validate(value) {
    if (!value || value.version !== 1 || typeof value.campaign !== 'string' || value.campaign.length > 200 || !Array.isArray(value.characters) || value.characters.length > 100) throw new Error('Format invalide');
    return { version: 1, campaign: value.campaign, characters: value.characters.map(pj => cleanFields(pj, pjKeys)), group: cleanFields(value.group, groupKeys) };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); $('save-state').textContent = 'Enregistré dans ce navigateur'; }
    catch { $('save-state').textContent = 'Échec de sauvegarde locale — exportez votre carnet pour le conserver.'; }
  }
  function field(target, key, title, multiline, changed) {
    const label = document.createElement('label');
    label.append(title);
    const input = document.createElement(multiline ? 'textarea' : 'input');
    input.value = target[key] || '';
    input.maxLength = 20000;
    input.addEventListener('input', () => { target[key] = input.value; save(); changed?.(); });
    label.append(input);
    return label;
  }
  function overview() {
    $('count').textContent = `${state.characters.length} PJ`;
    $('empty').hidden = state.characters.length > 0;
    $('roster').replaceChildren();
    state.characters.forEach((pj, i) => {
      const tr = document.createElement('tr');
      const identity = document.createElement('td');
      const link = document.createElement('a');
      link.href = `#pj-${i}`; link.textContent = pj.name || `PJ ${i + 1}`;
      link.addEventListener('click', () => { $(`pj-${i}`).open = true; });
      const role = document.createElement('small'); role.textContent = pj.role || 'Rôle à préciser';
      identity.append(link, role); tr.append(identity);
      [pj.level, `${pj.hp || '—'} / ${pj.hpMax || '—'}`, pj.defense, pj.speed, pj.perception, pj.initiative, [pj.conditions,pj.curses,pj.effects].filter(Boolean).join(' · ')].forEach(value => {
        const td = document.createElement('td'); td.textContent = value || '—'; tr.append(td);
      });
      $('roster').append(tr);
    });
  }
  function render(openIndex = -1) {
    $('campaign').value = state.campaign;
    $('cards').replaceChildren();
    state.characters.forEach((pj, index) => {
      const card = document.createElement('details'); card.id = `pj-${index}`; card.open = index === openIndex;
      const summary = document.createElement('summary');
      const update = () => { summary.textContent = `${pj.name || `PJ ${index + 1}`} · ${pj.role || 'Rôle à préciser'}`; overview(); };
      card.append(summary);
      if (pj.sourceId) {
        const source = document.createElement('p'); source.className = 'hint';
        source.textContent = `Fiche en ligne · ${pj.sourcePlayer} · room ${pj.sourceRoom}`; card.append(source);
      }
      [['Repères essentiels', basics], ...sections].forEach(([title, fields], sectionIndex) => {
        const section = document.createElement('div'); section.className = 'field-section';
        const heading = document.createElement('h3'); heading.textContent = title;
        const grid = document.createElement('div'); grid.className = 'fields';
        fields.forEach(([key, label]) => grid.append(field(pj, key, label, sectionIndex > 0, update)));
        section.append(heading, grid); card.append(section);
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove'; remove.textContent = 'Retirer ce PJ';
      remove.addEventListener('click', () => {
        if (!window.confirm(`Retirer ${pj.name || 'ce PJ'} et ses notes du carnet ?`)) return;
        state.characters.splice(index, 1); save(); render(); $('add-pj').focus();
      });
      card.append(remove); $('cards').append(card); update();
    });
    $('group-fields').replaceChildren();
    groupSections.forEach(([title, fields]) => {
      const panel = document.createElement('div'); panel.className = 'group-panel';
      const heading = document.createElement('h3'); heading.textContent = title; panel.append(heading);
      fields.forEach(([key, label]) => panel.append(field(state.group, key, label, true)));
      $('group-fields').append(panel);
    });
    overview();
  }
  $('campaign').addEventListener('input', event => { state.campaign = event.target.value; save(); });
  $('add-pj').addEventListener('click', () => {
    if (state.characters.length >= 100) { $('save-state').textContent = 'Limite de 100 PJ atteinte.'; return; }
    state.characters.push({}); save(); render(state.characters.length - 1);
    $('cards').lastElementChild.querySelector('input').focus();
  });
  $('export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'dice-forge-suivi-mj.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('import').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 5000000) throw new Error('Fichier trop volumineux');
      const imported = validate(JSON.parse(await file.text()));
      if (!window.confirm('Remplacer le carnet actuel par cette sauvegarde ? Exportez d’abord le carnet actuel si vous souhaitez le garder.')) return;
      state = imported; save(); render();
    } catch { $('save-state').textContent = 'Import refusé : sauvegarde MJ invalide ou trop volumineuse (5 Mo maximum). Le carnet actuel est conservé.'; }
    finally { event.target.value = ''; }
  });
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) state = validate(JSON.parse(saved));
    $('save-state').textContent = saved ? 'Carnet local restauré' : 'Prêt à accueillir votre groupe';
  } catch { $('save-state').textContent = 'Carnet local illisible ou stockage indisponible. Exportez vos nouvelles notes pour les conserver.'; }
  render();
  $('room-code').value = room;
  $('refresh-room').disabled = !room;
  $('room-login').href = `login.html?return=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  async function refreshRoom() {
    if (!room) return;
    $('refresh-room').disabled = true;
    $('room-status').textContent = `Chargement des fiches de ${room}…`;
    try {
      const [{ getSupabaseClient }, { mergeRoomSheets }] = await Promise.all([import('./supabase-client.js'), import('./mj-room-data.js')]);
      const client = getSupabaseClient();
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth?.user) {
        $('room-login').hidden = false;
        throw new Error('Connectez-vous avec le compte créateur de cette room pour charger les fiches.');
      }
      $('room-login').hidden = true;
      const { data: owner, error: ownerError } = await client.from('rooms').select('owner_id').eq('room_code', room).maybeSingle();
      if (ownerError) throw ownerError;
      if (!owner || owner.owner_id !== auth.user.id) throw new Error('Cette room est introuvable ou vous n’en êtes pas le créateur.');
      const { data: rows, error } = await client.from('pj_sheets').select('id, room_code, player_name, character_name, sheet_data').eq('room_code', room).order('player_name');
      if (error) throw error;
      state.characters = mergeRoomSheets(state.characters, rows || [], room);
      save(); render();
      $('room-status').textContent = rows?.length
        ? `${rows.length} fiche(s) chargée(s) depuis la room ${room}. Notes MJ et corrections locales conservées.`
        : `Aucune fiche accessible dans ${room}. Les joueurs doivent sauvegarder leur fiche en ligne dans cette room. Vérifiez aussi que la migration supabase-auth.sql a été appliquée.`;
    } catch (error) {
      $('room-status').textContent = `Chargement impossible : ${error.message || 'connexion indisponible'}. Carnet local conservé.`;
    } finally { $('refresh-room').disabled = false; }
  }
  $('refresh-room').addEventListener('click', refreshRoom);
  if (room) refreshRoom();
  else $('room-status').textContent = 'Carnet manuel — indiquez une room pour charger ses fiches.';
})();
