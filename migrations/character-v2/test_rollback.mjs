/** Real PostgreSQL integration rehearsal; never accepts a remote connection.
 * npm install --prefix <runtime> embedded-postgres@17.10.0-beta.17
 * node test_rollback.mjs <runtime> <backup.json> <v2.json> <output-directory>
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import net from 'node:net';

const [runtime, backupPath, v2Path, outputDir, deploymentPath] = process.argv.slice(2);
if (!runtime || !backupPath || !v2Path || !outputDir) throw new Error('Expected runtime, backup, v2, output directory');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sourceText = (await fs.readFile(backupPath, 'utf8')).replace(/^\uFEFF/, '');
const source = JSON.parse(sourceText)[0].backup;
const v2 = JSON.parse(await fs.readFile(v2Path, 'utf8'));
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.resolve(runtime, 'node_modules/embedded-postgres/dist/index.js')));
await fs.mkdir(outputDir, { recursive: true });
const runId = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const dbName = `diceforge_rollback_${runId.replace(/-/g, '_')}`;
const dataDir = path.resolve(outputDir, `cluster-${runId}`);
const listen = net.createServer();
await new Promise((resolve, reject) => { listen.once('error', reject); listen.listen(0, '127.0.0.1', resolve); });
const port = listen.address().port;
await new Promise(resolve => listen.close(resolve));
const engine = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres',
  password: randomBytes(24).toString('hex'), port, persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-h', '127.0.0.1', '-c', 'log_min_error_statement=panic'] });
const checks = [];
let client;
const quote = identifier => `"${identifier.replaceAll('"', '""')}"`;
const legacyTables = ['personnages', 'pj_sheets', 'pj_inventory'];
const canonical = value => JSON.stringify(sortJson(value));
function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sortJson(value[k])]));
  return value;
}
function checksum(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
async function record(name, task) { await task(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
async function insertRows(schema, table, rows, override = false) {
  for (const row of rows) {
    const keys = Object.keys(row);
    // JS objects and arrays are explicitly encoded as JSON for json/jsonb fields.
    const values = keys.map(k => row[k] && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]);
    await client.query(`insert into ${quote(schema)}.${quote(table)} (${keys.map(quote).join(',')}) ${override ? 'overriding system value' : ''} values (${keys.map((_, i) => `$${i + 1}`).join(',')})`, values);
  }
}
async function legacySnapshot() {
  const result = {};
  for (const table of legacyTables) {
    const key = table === 'personnages' ? 'player_name' : 'id';
    const { rows } = await client.query(`select to_jsonb(t) as payload from public.${quote(table)} t order by ${quote(key)}`);
    result[table] = rows.map(r => r.payload);
  }
  return result;
}
function sortedSource() {
  return Object.fromEntries(legacyTables.map(table => {
    const key = table === 'personnages' ? 'player_name' : 'id';
    return [table, [...source[table]].sort((a, b) => typeof a[key] === 'number' ? a[key] - b[key] : a[key].localeCompare(b[key], 'en'))];
  }));
}
async function schemaSnapshot() {
  const { rows } = await client.query(`select
    (select jsonb_agg(jsonb_build_object('table', c.relname, 'name', x.conname, 'definition', pg_get_constraintdef(x.oid)) order by c.relname,x.conname)
     from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') as constraints,
    (select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public') as policies,
    (select jsonb_agg(jsonb_build_object('table',relname,'rls',relrowsecurity) order by relname)
     from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r') as rls,
    (select jsonb_agg(jsonb_build_object('table',tablename,'index',indexdef) order by tablename,indexname)
     from pg_indexes where schemaname='public') as indexes`);
  return rows[0];
}
async function restoreLegacy() {
  assert.equal(client.database, dbName, 'Restoration restricted to the database created by this test');
  await client.query('begin');
  try {
    for (const table of legacyTables) {
      await client.query(`delete from public.${quote(table)}`);
      await insertRows('public', table, source[table], table !== 'personnages');
    }
    for (const table of ['pj_sheets', 'pj_inventory']) {
      await client.query(`select setval(pg_get_serial_sequence('public.${table}', 'id'), (select max(id) from public.${table}), true)`);
    }
    await client.query('commit');
  } catch (error) { await client.query('rollback'); throw error; }
}

try {
  await engine.initialise();
  await engine.start();
  await engine.createDatabase(dbName);
  client = engine.getPgClient(dbName, '127.0.0.1');
  await client.connect();
  await client.query("set timezone = 'UTC'");
  const version = (await client.query('show server_version')).rows[0].server_version;
  await client.query(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.rooms(room_code text primary key, owner_id uuid references auth.users(id), owner_name text not null default '', created_at timestamptz not null default now());
    create table public.room_members(room_code text references public.rooms(room_code), user_id uuid references auth.users(id), player_name text, primary key(room_code,user_id));
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';`);
  const owners = [...new Set(legacyTables.flatMap(t => source[t].map(r => r.user_id)).filter(Boolean))];
  await insertRows('auth', 'users', owners.map(id => ({ id })));
  const mj = source.personnages.find(p => p.player_name === 'MJ')?.user_id;
  const rooms = [...new Set([...source.pj_sheets, ...source.pj_inventory].map(r => r.room_code))];
  await insertRows('public', 'rooms', rooms.map(room_code => ({ room_code, owner_id: mj, owner_name: 'MJ' })));
  await insertRows('public', 'room_members', owners.map(user_id => ({ room_code: '4SSU', user_id, player_name: 'Member' })));
  // Restore only the CREATE TABLE block from repository definitions, not destructive migrations.
  for (const [table, filename] of [['personnages', 'supabase-personnages.sql'], ['pj_sheets', 'supabase-pj-sheets.sql'], ['pj_inventory', 'supabase-inventory.sql']]) {
    const sql = await fs.readFile(path.join(root, filename), 'utf8');
    const expression = new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`, 'i');
    const create = sql.match(expression)?.[0];
    assert(create, `Legacy table definition not found: ${table}`);
    await client.query(create);
    await client.query(`alter table public.${quote(table)} enable row level security;
      create policy owner_read on public.${quote(table)} for select to authenticated using (user_id = auth.uid());
      grant select,insert,update on public.${quote(table)} to authenticated;`);
  }
  await restoreLegacy();
  const original = await legacySnapshot();
  const originalSchema = await schemaSnapshot();
  await record('Sauvegarde JSON restaurée dans PostgreSQL, comparaison exacte des 20 lignes', async () => {
    assert.equal(canonical(original), canonical(sortedSource()));
  });
  await record('Création réelle du schéma v2', async () => client.query(await fs.readFile(deploymentPath || path.join(here, 'schema.sql'), 'utf8')));
  await record('Import réel des personnages, états, catalogues, compétences, sorts, objets et archives', async () => {
    if (deploymentPath) return;
    await client.query('begin');
    try {
      await insertRows('diceforge_v2', 'campaigns', v2.campaigns.map(c => ({ ...c, owner_user_id: mj })));
      await insertRows('diceforge_v2', 'campaign_rooms', [{ room_code: '4SSU', campaign_id: v2.campaigns[0].id }]);
      await insertRows('diceforge_v2', 'characters', v2.characters);
      await insertRows('diceforge_v2', 'states', v2.states);
      await insertRows('diceforge_v2', 'skill_catalog', v2.catalog.skills);
      await insertRows('diceforge_v2', 'spell_catalog', v2.catalog.spells);
      await insertRows('diceforge_v2', 'skills', v2.skills);
      await insertRows('diceforge_v2', 'spells', v2.spells.map(({ name, ...r }) => r));
      await insertRows('diceforge_v2', 'items', v2.items);
      await insertRows('diceforge_v2', 'wallets', v2.wallets);
      await insertRows('diceforge_v2', 'archives', v2.archives);
      await insertRows('diceforge_v2', 'migration_issues', v2.issues.map(payload => ({ payload })));
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; }
  });
  await record('Données v2 lues depuis PostgreSQL et comparées à toutes les valeurs préparées', async () => {
    for (const [table, expected] of Object.entries({ characters: v2.characters, states: v2.states, skills: v2.skills,
      spells: v2.spells.map(({ name, ...r }) => r), items: v2.items, wallets: v2.wallets, archives: v2.archives })) {
      const { rows } = await client.query(`select to_jsonb(t) as payload from diceforge_v2.${quote(table)} t`);
      const key = table === 'wallets' ? 'state_id' : 'id';
      assert.equal(rows.length, expected.length);
      for (const wanted of expected) {
        const actual = rows.find(r => r.payload[key] === wanted[key])?.payload;
        assert(actual);
        for (const field of Object.keys(wanted)) {
          assert.equal(canonical(actual[field]), canonical(wanted[field]), `${table}/${wanted[key]}/${field}`);
        }
      }
    }
  });
  await record('Anciennes tables et schéma inchangés après import v2', async () => {
    assert.equal(canonical(await legacySnapshot()), canonical(original));
    assert.equal(canonical(await schemaSnapshot()), canonical(originalSchema));
  });
  await record('Installation des RPC et du commutateur applicatif', async () => {
    if (deploymentPath) return;
    await client.query(await fs.readFile(path.join(here, 'api.sql'), 'utf8'));
    for (const [legacy_index, id] of v2.catalog.legacy_catalogs.brp_57_v1.entries()) {
      if (id) await client.query('update diceforge_v2.skill_catalog set legacy_index=$1 where id=$2', [legacy_index,id]);
    }
    for (const [alias,name] of Object.entries(v2.catalog.aliases)) {
      await client.query('update diceforge_v2.skill_catalog set aliases=aliases || to_jsonb($1::text) where name=$2',[alias,name]);
    }
  });
  const ced = source.personnages.find(p => p.player_name === 'Ced').user_id;
  const query = async (resource,operation='read',filters={},payload=null,room='4SSU') =>
    (await client.query('select public.df_character_query($1,$2,$3,$4,$5) as result',[resource,operation,filters,payload,room])).rows[0].result;
  await record('Retour applicatif immédiat vers les tables anciennes', async () => {
    assert.deepEqual(await query('pj_sheets'), {legacy:true});
    await client.query('update diceforge_v2.configuration set enabled=true');
  });
  await record('Droits joueur/MJ, refus anonyme et lecture de Gram depuis 4SSU', async () => {
    await client.query("select set_config('request.jwt.claim.sub',$1,false)",[ced]);
    await client.query('set role authenticated');
    const sheets = (await query('pj_sheets')).rows;
    assert.equal(sheets.length,1); assert.equal(sheets[0].sheet_data.stats.pouvoir,13);
    assert.equal(sheets[0].sheet_data.spells.filter(s=>s.name).length,6);
    assert.equal((await query('pj_sheets','read',{user_id:mj})).rows.length,0);
    await client.query('reset role');
    await client.query("select set_config('request.jwt.claim.sub',$1,false)",[mj]);
    await client.query('set role authenticated');
    assert.equal((await query('pj_sheets')).rows.length,4);
    await assert.rejects(query('pj_sheets','upsert',{}, {user_id:ced,character_name:'Gram Tolgarinn'}), /Propriétaire incorrect/);
    await client.query('reset role'); await client.query('set role anon');
    await assert.rejects(query('pj_sheets'), /permission denied/);
    await client.query('reset role');
  });
  await record('Écritures atomiques, IDs stables, conflit refusé et inventaire conservé', async () => {
    await client.query('begin');
    try {
      await client.query("select set_config('request.jwt.claim.sub',$1,false)",[ced]);
      const saved=(await query('pj_sheets')).rows[0];
      const beforeIds=(await client.query('select id from diceforge_v2.skills where state_id=$1 order by id',[saved.id])).rows;
      const inventory=(await query('pj_inventory')).rows[0];
      const updated=structuredClone(saved.sheet_data); updated.fields.custom='Champ inconnu conservé';
      const written=await query('pj_sheets','upsert',{}, {user_id:ced,character_name:saved.character_name,sheet_data:updated,expected_revision:saved.revision});
      assert.equal(written.rows[0].revision,saved.revision+1);
      assert.deepEqual((await client.query('select id from diceforge_v2.skills where state_id=$1 order by id',[saved.id])).rows,beforeIds);
      assert.deepEqual((await query('pj_inventory')).rows[0].weapons,inventory.weapons);
      await client.query('savepoint conflict');
      await assert.rejects(query('pj_sheets','upsert',{}, {user_id:ced,character_name:saved.character_name,sheet_data:updated,expected_revision:saved.revision}), /La fiche a changé/);
      await client.query('rollback to savepoint conflict');
      const wallet=(await query('pj_inventory')).rows[0];
      const walletWritten=await query('pj_inventory','upsert',{}, {...wallet,expected_revision:wallet.revision});
      assert.deepEqual(walletWritten.rows[0].miscellaneous,wallet.miscellaneous);
      const next=(await query('pj_sheets')).rows[0];
      assert.equal(next.sheet_data.fields.custom,'Champ inconnu conservé');
    } finally { await client.query('rollback'); }
  });
  await record('Deux séances partagent le même état de campagne', async () => {
    await client.query('begin');
    try {
      await client.query("select set_config('request.jwt.claim.sub',$1,false)",[mj]);
      await insertRows('public','rooms',[{room_code:'TST2',owner_id:mj}]);
      await client.query("select public.df_link_campaign_room('4SSU','TST2')");
      const first=(await query('pj_sheets','read',{user_id:ced})).rows[0];
      const second=(await query('pj_sheets','read',{user_id:ced},null,'TST2')).rows[0];
      assert.equal(first.id,second.id); assert.deepEqual(first.sheet_data,second.sheet_data);
    } finally { await client.query('rollback'); }
    await client.query(await fs.readFile(path.join(here,'switch-legacy.sql'),'utf8'));
    assert.deepEqual(await query('pj_sheets'),{legacy:true});
  });
  const rollbackSql = await fs.readFile(path.join(here, 'rollback.sql'), 'utf8');
  await record('Retour arrière non armé refusé', async () => {
    await assert.rejects(client.query(rollbackSql), /non armé/);
    await client.query('rollback');
    assert.equal((await client.query("select exists(select 1 from pg_namespace where nspname='diceforge_v2') as present")).rows[0].present, true);
  });
  await record('Retour arrière SQL exécuté, schéma v2 retiré', async () => {
    await client.query("set diceforge.allow_v2_rollback = 'yes'");
    await client.query(rollbackSql);
    assert.equal((await client.query("select exists(select 1 from pg_namespace where nspname='diceforge_v2') as present")).rows[0].present, false);
  });
  await record('Après rollback : données, contraintes, index et politiques anciens identiques', async () => {
    assert.equal(canonical(await legacySnapshot()), canonical(original));
    assert.equal(canonical(await schemaSnapshot()), canonical(originalSchema));
  });
  await record('Restauration après corruption volontaire de la copie locale', async () => {
    await client.query("update public.personnages set pouvoir=99 where player_name='Ced'");
    await client.query("update public.pj_sheets set sheet_data='{}', markdown_content='CORROMPU' where player_name='Ced'");
    await client.query("delete from public.pj_inventory where player_name='Ced'");
    assert.notEqual(canonical(await legacySnapshot()), canonical(original));
    await restoreLegacy();
    assert.equal(canonical(await legacySnapshot()), canonical(original));
    assert.equal(canonical(await schemaSnapshot()), canonical(originalSchema));
  });
  await record('Séquences restaurées sans collision et insertion de contrôle annulée', async () => {
    await client.query('begin');
    try {
      const sheetId = (await client.query("insert into public.pj_sheets(room_code,player_name,character_name) values('4SSU','rollback-control','Control') returning id")).rows[0].id;
      const inventoryId = (await client.query("insert into public.pj_inventory(room_code,player_name) values('4SSU','rollback-control') returning id")).rows[0].id;
      assert(Number(sheetId) > Math.max(...source.pj_sheets.map(r => r.id)));
      assert(Number(inventoryId) > Math.max(...source.pj_inventory.map(r => r.id)));
    } finally { await client.query('rollback'); }
    assert.equal(canonical(await legacySnapshot()), canonical(original));
  });
  const report = { passed: true, tested_at: new Date().toISOString(), postgres_version: version,
    local_database: dbName, checks, before_sha256: checksum(original), after_sha256: checksum(await legacySnapshot()),
    source_rows: Object.fromEntries(legacyTables.map(t => [t, source[t].length])),
    production_modified: false, application_switch_tested: true, browser_application_tested: false,
    scope: 'Real PostgreSQL data/schema rehearsal of parallel v2 migration and JSON restore; local auth/room stubs, repository legacy table definitions. Not a full Supabase deployment restore.' };
  await fs.writeFile(path.join(outputDir, 'rollback-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks: checks.length, postgres_version: version, before_sha256: report.before_sha256, after_sha256: report.after_sha256 }));
} catch (error) {
  await fs.writeFile(path.join(outputDir, 'rollback-failure.json'), JSON.stringify({ passed: false, checks, error: String(error), stack: error.stack }, null, 2));
  throw error;
} finally {
  if (client) await client.end();
  await engine.stop();
}
