// Read the latest cloud sheet and change only the selected experience checkbox.
export async function saveExperienceCheck(client, room, check, stateId) {
  if (!room?.userId || !room?.code) throw new Error('Rejoins une partie pour sauvegarder la coche.');
  const collection = check.kind === 'spell' ? 'spells' : 'skills';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const read = await client.from('pj_sheets').select('*')
      .eq('user_id', room.userId).eq('room_code', room.code).maybeSingle();
    if (read.error) throw read.error;
    const row = read.data;
    if (!row?.sheet_data) throw new Error('Aucune fiche en ligne à mettre à jour.');
    const sheet = structuredClone(row.sheet_data);
    if (stateId && sheet.state_id !== stateId) throw new Error('Le personnage en ligne a changé.');
    const entries = sheet[collection] || [];
    const entry = check.id ? entries.find(value => value.id === check.id) : entries[check.index];
    if (!entry || (check.name && entry.name && check.name !== entry.name)) throw new Error('Compétence introuvable dans la fiche en ligne.');
    if (entry.checked) return row;
    entry.checked = true;
    const result = await client.from('pj_sheets').update({ sheet_data: sheet, updated_at: new Date().toISOString() })
      .eq('user_id', room.userId).eq('room_code', room.code)
      .eq('updated_at', row.updated_at).select('*').maybeSingle();
    if (result.error && result.error.code !== '40001') throw result.error;
    if (!result.error && result.data) return result.data;
  }
  throw new Error('La fiche change en même temps. Coche conservée localement ; réessaie le jet ou sauvegarde la fiche.');
}
