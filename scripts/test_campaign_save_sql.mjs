// Synthetic integration test, isolated local PostgreSQL only.
// node scripts/test_campaign_save_sql.mjs <embedded-postgres-runtime-directory>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const runtime = process.argv[2];
if (!runtime) throw Error('Provide a directory containing node_modules/embedded-postgres.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.resolve(runtime, 'node_modules/embedded-postgres/dist/index.js')));
const listener = net.createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const engine = new EmbeddedPostgres({ databaseDir: path.join(os.tmpdir(), `diceforge-save-test-${randomUUID()}`),
  user: 'postgres', password: randomUUID(), port, persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1', '-c', 'log_min_error_statement=panic'] });
let client;
try {
  await engine.initialise(); await engine.start(); await engine.createDatabase('save_test');
  client = engine.getPgClient('save_test', '127.0.0.1'); await client.connect();
  await client.query(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    create table public.rooms(room_code text primary key,owner_id uuid);
    create table public.room_members(room_code text,user_id uuid);`);
  for (const name of ['schema.sql', 'api.sql', 'save-fixes.sql', 'save-fixes.sql']) {
    await client.query(await fs.readFile(path.join(root, 'migrations/character-v2', name), 'utf8'));
  }
  const uid = randomUUID();
  await client.query('insert into auth.users values($1)', [uid]);
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  await client.query("insert into public.rooms values('TEST',$1),('DEST',$1)", [uid]);
  await client.query("insert into public.room_members values('TEST',$1),('DEST',$1)", [uid]);
  await client.query('update diceforge_v2.configuration set enabled=true');
  await client.query("select public.df_link_campaign_room(null,'TEST'),public.df_link_campaign_room(null,'DEST')");
  const rpc = async (resource, operation, filters, payload, room = 'TEST') =>
    (await client.query('select public.df_character_query($1,$2,$3,$4,$5) result', [resource, operation, filters, payload, room])).rows[0].result;
  await rpc('personnages', 'insert', {}, { user_id: uid, nom: 'A', player_name: 'Player', force: 12, dexterite: 13 });
  const raw = { fields: { name: 'A', profession: 'Sorcier', race: 'Humain' }, stats: { force: '12', dexterite: '13' }, skills: [], spells: [] };
  let sheet = (await rpc('pj_sheets', 'upsert', {}, { user_id: uid, character_name: 'A', sheet_data: raw })).rows[0];
  const destination = (await rpc('pj_sheets', 'upsert', {}, { user_id: uid, character_name: 'A', sheet_data: raw }, 'DEST')).rows[0];
  const inventoryPayload = { user_id: uid, character_name: 'A', po: 0, pa: 0, pc: 0, equipment: [] };
  let inventory = (await rpc('pj_inventory', 'read', {}, null)).rows[0];
  inventory = (await rpc('pj_inventory', 'upsert', {}, { ...inventoryPayload, expected_revision: inventory.revision })).rows[0];
  // Inventory changed, but the loaded sheet is still current for its resource.
  sheet = (await rpc('pj_sheets', 'upsert', {}, { user_id: uid, character_name: 'A', sheet_data: sheet.sheet_data, expected_revision: sheet.revision })).rows[0];
  // Sheet changed, but the loaded inventory remains writable.
  inventory = (await rpc('pj_inventory', 'upsert', {}, { ...inventoryPayload, po: 1, expected_revision: inventory.revision })).rows[0];
  await assert.rejects(rpc('pj_inventory', 'upsert', {}, { ...inventoryPayload, expected_revision: inventory.revision - 1 }), error => error.code === '40001');
  await rpc('personnages', 'update', { user_id: uid }, { user_id: uid, nom: 'A', player_name: 'Player', force: 18 });
  assert.equal((await rpc('personnages', 'read', { user_id: uid }, null)).rows[0].force, 18);
  assert.equal((await rpc('personnages', 'read', { user_id: uid }, null)).rows[0].dexterite, 13, 'Omitted stats survive generator edits');
  assert.equal((await rpc('personnages', 'read', { user_id: uid }, null, 'DEST')).rows[0].force, 12, 'Other campaign is unchanged');
  await assert.rejects(rpc('pj_sheets', 'upsert', {}, { user_id: uid, character_name: 'A', sheet_data: sheet.sheet_data, expected_revision: sheet.revision }), error => error.code === '40001');
  sheet = (await rpc('pj_sheets', 'read', {}, null)).rows[0];
  const empty = { ...sheet.sheet_data, stats: { force: '', dexterite: null } };
  sheet = (await rpc('pj_sheets', 'upsert', {}, { user_id: uid, character_name: 'A', sheet_data: empty, expected_revision: sheet.revision })).rows[0];
  assert.equal(sheet.sheet_data.stats.force, null); assert.equal(sheet.sheet_data.stats.dexterite, null);
  for (const value of ['bad', '-1', '1.5', '1000']) {
    await assert.rejects(rpc('pj_sheets', 'upsert', {}, { user_id: uid, character_name: 'A', sheet_data: { ...sheet.sheet_data, stats: { force: value } }, expected_revision: sheet.revision }), error => error.code === '22023');
  }
  const { transferSheetData } = await import('data:text/javascript;base64,' + Buffer.from(await fs.readFile(path.join(root, 'js/sheet-validation.js'), 'utf8')).toString('base64'));
  assert.notEqual(destination.revision, sheet.revision);
  const copied = (await rpc('pj_sheets', 'upsert', {}, { user_id: uid, character_name: 'A', sheet_data: transferSheetData(sheet.sheet_data, destination), expected_revision: destination.revision }, 'DEST')).rows[0];
  assert.equal(copied.id, destination.id); assert.equal(copied.sheet_data.stats.force, null);
  const revision = copied.revision;
  await client.query(await fs.readFile(path.join(root, 'migrations/character-v2/save-fixes.sql'), 'utf8'));
  assert.equal((await rpc('pj_sheets', 'read', {}, null, 'DEST')).rows[0].revision, revision, 'Reapplying upgrade preserves revisions');
  console.log('PASS SQL: independent revisions, true conflicts, generator sync/isolation, N/A, validation, transfer and repeatable upgrade.');
} finally {
  if (client) await client.end();
  await engine.stop();
}
