const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const { saveExperienceCheck } = await import(`data:text/javascript;base64,${fs.readFileSync('js/experience-save.js').toString('base64')}`);
  const room = { userId: 'owner', code: '4SSU' };
  let row = { updated_at: 'one', sheet_data: { state_id: 'state', revision: 1, fields: { notes: 'keep' }, skills: [{ id: 'a', checked: false }, { id: 'b', checked: false }], spells: [{ id: 'spell', checked: false }] } };
  let conflict = true, writes = 0;
  const client = { from() {
    let payload, filters = {};
    return { select() { return this; }, eq(k, v) { filters[k] = v; return this; }, update(p) { payload = p; return this; }, async maybeSingle() {
      assert.equal(filters.user_id, 'owner'); assert.equal(filters.room_code, '4SSU');
      if (!payload) return { data: structuredClone(row) };
      writes++;
      if (conflict) { conflict = false; row.sheet_data.fields.notes = 'concurrent edit'; row.sheet_data.revision++; row.updated_at = 'two'; return { error: { code: '40001' } }; }
      assert.equal(filters.updated_at, row.updated_at);
      row = { updated_at: payload.updated_at, sheet_data: payload.sheet_data };
      row.sheet_data.revision++;
      return { data: structuredClone(row) };
    } };
  } };
  await saveExperienceCheck(client, room, { kind: 'skill', id: 'b', index: 0 }, 'state');
  assert.equal(row.sheet_data.skills[1].checked, true);
  assert.equal(row.sheet_data.skills[0].checked, false);
  assert.equal(row.sheet_data.fields.notes, 'concurrent edit');
  assert.equal(writes, 2);
  await saveExperienceCheck(client, room, { kind: 'skill', id: 'b' }, 'state');
  assert.equal(writes, 2);
  await saveExperienceCheck(client, room, { kind: 'spell', id: 'spell' }, 'state');
  assert.equal(row.sheet_data.spells[0].checked, true);
  await assert.rejects(saveExperienceCheck(client, room, { kind: 'skill', id: 'missing' }, 'state'));
  await assert.rejects(saveExperienceCheck(client, room, { kind: 'skill', id: 'a' }, 'other'));
  client.from = () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { return { error: new Error('offline') }; } });
  await assert.rejects(saveExperienceCheck(client, room, { id: 'a' }, 'state'), /offline/);
  console.log('Experience auto-save: stable IDs, conflict retry, preserved edits, spells, duplicates and errors passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
