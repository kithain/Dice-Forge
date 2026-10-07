// Synthetic integration checks. This starts its own PostgreSQL on localhost only.
// node scripts/test_campaign_management_sql.mjs <embedded-postgres-runtime-directory>
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
const databaseDir = path.resolve(os.tmpdir(), `diceforge-campaign-test-${randomUUID()}`);
const engine = new EmbeddedPostgres({ databaseDir, user: 'postgres', password: randomUUID(), port,
  persistent: process.platform === 'win32', initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-h', '127.0.0.1', '-c', 'log_min_error_statement=panic'] });
let client;
let checks = 0;
const check = (value, message) => { assert(value, message); checks++; };
const reject = async (promise, codes, message) => {
  await assert.rejects(promise, error => [].concat(codes).includes(error.code), message);
  checks++;
};
try {
  await engine.initialise(); await engine.start(); await engine.createDatabase('campaign_test');
  client = engine.getPgClient('campaign_test', '127.0.0.1'); await client.connect();
  await client.query(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    create table public.rooms(room_code text primary key,owner_id uuid,owner_name text);
    create table public.room_members(room_code text,user_id uuid,player_name text,primary key(room_code,user_id));
    create table public.rolls(room_code text,user_id uuid,player_name text,expression text,rolls_detail text,total integer,is_crit boolean,is_fail boolean,is_hidden boolean);
    create table public.personnages(player_name text primary key,user_id uuid,nom text,notes text);
    create table public.pj_sheets(id bigint generated always as identity primary key,room_code text,user_id uuid,player_name text,character_name text,sheet_data jsonb,markdown_content text);
    create table public.pj_inventory(id bigint generated always as identity primary key,room_code text,user_id uuid,player_name text,character_name text,po integer,pa integer,pc integer,equipment jsonb);
    grant usage on schema public,auth to authenticated,anon;
    grant select,insert,update,delete on public.rooms,public.room_members to authenticated;`);
  const migrate = async file => client.query(await fs.readFile(path.join(root, 'migrations/character-v2', file), 'utf8'));
  for (const file of ['schema.sql','api.sql','save-fixes.sql']) await migrate(file);
  const catalog = JSON.parse(await fs.readFile(path.join(root, 'migrations/character-v2/catalog.json'), 'utf8'));
  for (const [index, row] of catalog.skills.entries()) await client.query('insert into diceforge_v2.skill_catalog(id,name,legacy_index) values($1,$2,$3)', [row.id,row.name,index]);
  for (const row of catalog.spells) await client.query('insert into diceforge_v2.spell_catalog(id,name) values($1,$2)', [row.id,row.name]);
  const mj = randomUUID(), otherMj = randomUUID(), player = randomUUID(), outsider = randomUUID();
  await client.query('insert into auth.users values($1),($2),($3),($4)', [mj,otherMj,player,outsider]);
  const login = uid => client.query("select set_config('request.jwt.claim.sub',$1,false)", [uid || '']);
  await login(mj);
  await client.query("insert into public.rooms values('4SSU',$1,'MJ'),('OLD1',$1,'MJ'),('OLD2',$1,'MJ')", [mj]);
  await client.query("insert into public.room_members values('4SSU',$1,'MJ'),('OLD1',$1,'MJ'),('4SSU',$2,'Joueur'),('OLD1',$2,'Joueur')", [mj,player]);
  await client.query('update diceforge_v2.configuration set enabled=true');
  await client.query("select public.df_link_campaign_room(null,'4SSU'),public.df_link_campaign_room(null,'OLD1')");
  const canonical = (await client.query("select campaign_id from diceforge_v2.campaign_rooms where room_code='4SSU'")).rows[0].campaign_id;
  const historical = (await client.query("select campaign_id from diceforge_v2.campaign_rooms where room_code='OLD1'")).rows[0].campaign_id;
  const query = async (resource, operation='read', filters={}, payload=null, room='4SSU') =>
    (await client.query('select public.df_character_query($1,$2,$3,$4,$5) result', [resource,operation,filters,payload,room])).rows[0].result;
  await login(player);
  await query('personnages','insert',{}, {user_id:player,nom:'Ilya',player_name:'Joueur',intelligence:16});
  const data = {fields:{name:'Ilya',profession:'Sorcier',race:'Humain',skillProfessionalPool:'325',notes:'Canonical notes'},
    stats:{intelligence:16,force:12},skills:[{id:'skill.estimation',base:15,points:25,score:40,checked:false}],spells:[],weapons:[]};
  const original = (await query('pj_sheets','upsert',{}, {user_id:player,character_name:'Ilya',sheet_data:data})).rows[0];
  const secondary = (await query('pj_sheets','upsert',{}, {user_id:player,character_name:'Ilya',sheet_data:{...data,fields:{...data.fields,notes:'Secondary history'}}},'OLD1')).rows[0];
  const inventory = (await query('pj_inventory')).rows[0];
  await query('pj_inventory','upsert',{id:original.id}, {user_id:player,character_name:'Ilya',expected_revision:inventory.revision,
    po:7,pa:2,pc:1,weapons:[],armors:[],equipment:[{name:'Carnet',description:'Historique à conserver'}],consumables:[],miscellaneous:[]});
  await client.query("insert into public.personnages values('Joueur',$1,'Ilya','Legacy notes')", [player]);
  await client.query("insert into public.pj_sheets(room_code,user_id,player_name,character_name,sheet_data,markdown_content) values('4SSU',$1,'Joueur','Ilya',$2,'Legacy markdown')", [player,data]);
  await client.query("insert into public.pj_inventory(room_code,user_id,player_name,character_name,po,pa,pc,equipment) values('OLD1',$1,'Joueur','Ilya',7,2,1,'[]')", [player]);
  await login(mj);
  for (const file of ['creation-lock.sql','progression.sql','progression-publication.sql','spell-learning.sql','character-roster.sql','character-generation.sql','campaign-sheet-copy.sql','character-deletion.sql']) await migrate(file);
  await client.query('insert into diceforge_v2.mj_users values($1) on conflict do nothing', [otherMj]);
  const statesBefore = (await client.query('select id,character_id,diceforge_v2.sheet(id) sheet,diceforge_v2.inventory(id) inventory from diceforge_v2.states order by id')).rows;
  const legacyBefore = {};
  for (const table of ['personnages','pj_sheets','pj_inventory']) legacyBefore[table] = (await client.query(`select to_jsonb(t) row from public.${table} t order by to_jsonb(t)::text`)).rows.map(r=>r.row);

  await migrate('campaign-valombre.sql');
  check((await client.query('select id from diceforge_v2.campaigns where name=\'Valombre\' and archived_at is null')).rows[0].id===canonical, 'Valombre keeps the canonical campaign UUID');
  check((await client.query('select bool_and(campaign_id=$1) ok from public.rooms', [canonical])).rows[0].ok, 'All historical rooms, including an unlinked room, belong to Valombre');
  check((await client.query('select bool_and(r.campaign_id=c.campaign_id) ok from public.rooms r join diceforge_v2.campaign_rooms c using(room_code)')).rows[0].ok, 'Public and private historical room links agree');
  for (const table of ['personnages','pj_sheets','pj_inventory']) {
    const rows = (await client.query(`select to_jsonb(t) row from public.${table} t order by (to_jsonb(t)-'campaign_id')::text`)).rows.map(r=>r.row);
    assert.deepEqual(rows.map(({campaign_id,...row})=>row), legacyBefore[table], `${table}: historical values preserved`);
    check(rows.every(row=>row.campaign_id===canonical), `${table}: campaign UUID backfilled`);
  }
  for (const before of statesBefore) {
    const after = (await client.query('select character_id,campaign_id,diceforge_v2.sheet(id) sheet,diceforge_v2.inventory(id) inventory from diceforge_v2.states where id=$1', [before.id])).rows[0];
    assert(after, 'No state is deleted during backfill');
    assert.deepEqual(after.sheet, before.sheet, 'Full historical sheet and revisions survive');
    assert.deepEqual(after.inventory, before.inventory, 'Full historical inventory and revisions survive');
    assert.equal(after.character_id, before.character_id, 'Permanent character identity survives');
    checks++;
  }
  check((await client.query('select archived_at is not null archived from diceforge_v2.campaigns where id=$1', [historical])).rows[0].archived, 'Conflicting secondary state remains in an archived campaign');
  check((await client.query('select campaign_id from diceforge_v2.states where id=$1', [original.id])).rows[0].campaign_id===canonical, 'Canonical state keeps its ID and campaign');
  check((await client.query('select campaign_id from diceforge_v2.states where id=$1', [secondary.id])).rows[0].campaign_id===historical, 'Secondary history is preserved without destructive merging');
  const afterFirstBackfill = (await client.query('select id,campaign_id,revision from diceforge_v2.states order by id')).rows;
  await migrate('campaign-valombre.sql');
  assert.deepEqual((await client.query('select id,campaign_id,revision from diceforge_v2.states order by id')).rows, afterFirstBackfill);
  checks++;

  await migrate('campaign-management.sql');
  const campaigns = async (operation='list', campaign=null, name=null, description=null, room=null) =>
    (await client.query('select public.df_campaigns($1,$2,$3,$4,$5) result', [operation,campaign,name,description,room])).rows[0].result;
  const createRoom = async (code, campaign, source=null) =>
    (await client.query('select public.df_create_session_room($1,$2,$3,$4) result', [source,code,'MJ',campaign])).rows[0].result;
  const legacyRoom = async (code, source=null) =>
    (await client.query('select public.df_create_session_room($1,$2,$3) result', [source,code,'MJ'])).rows[0].result;
  let list = await campaigns();
  check(list.is_mj && list.campaigns.length===1 && list.campaigns[0].id===canonical && list.campaigns[0].can_manage, 'MJ sees Valombre and no archived campaigns');
  check(list.campaigns[0].room_count===3, 'Campaign list reports its linked rooms');
  for (const name of ['', '   ', 'x'.repeat(121)]) await reject(campaigns('create',null,name,'Description'),'22023', 'Invalid campaign names are refused');
  await reject(campaigns('create',null,'Bad description','x'.repeat(10001)),'22023');
  const created = await campaigns('create',null,'  Aurore  ','  Première description  ');
  const fresh = created.campaign.id;
  check(/^[0-9a-f-]{36}$/.test(fresh) && fresh!==canonical, 'Campaign receives a unique generated UUID');
  check(created.campaign.name==='Aurore' && created.campaign.description==='Première description', 'Campaign name and description are persisted');
  const twin = (await campaigns('create',null,'Aurore','Homonyme')).campaign.id;
  check(twin!==fresh, 'Two equal names keep distinct campaign identities');
  const updated = await campaigns('update',fresh,'Aurore II','Description modifiée');
  check(updated.campaign.id===fresh && updated.campaign.name==='Aurore II' && updated.campaign.description==='Description modifiée', 'Editing a campaign preserves its ID');
  await reject(campaigns('update',fresh,'','Description'),'22023');
  await reject(campaigns('invalid'), '22023');
  await reject(createRoom('NONE',null), '22023');
  await reject(legacyRoom('NONE'), ['22023','42501']);
  await reject(createRoom('ARCH',historical), '42501');
  await reject(createRoom('MISS',randomUUID()), '42501');
  const room = await createRoom('NEW1',fresh);
  check(room.campaign_id===fresh, 'Explicit campaign chosen for a new room');
  const roomLink = (await client.query("select r.campaign_id,c.campaign_id private_id,rm.user_id from public.rooms r join diceforge_v2.campaign_rooms c using(room_code) join public.room_members rm using(room_code) where r.room_code='NEW1'")).rows[0];
  check(roomLink.campaign_id===fresh && roomLink.private_id===fresh && roomLink.user_id===mj, 'Room and MJ membership created with coherent campaign links');
  check((await legacyRoom('OLD3','4SSU')).campaign_id===canonical, 'Old 3arg clients may continue a valid source campaign');
  await reject(createRoom('MISM',fresh,'4SSU'), ['22023','42501']);
  await reject(client.query("update public.rooms set campaign_id=$1 where room_code='NEW1'", [canonical]), ['22023','42501','23514']);
  await reject(client.query("update diceforge_v2.campaign_rooms set campaign_id=$1 where room_code='NEW1'", [canonical]), ['22023','42501','23514']);
  await reject(client.query("delete from diceforge_v2.campaign_rooms where room_code='NEW1'"), ['22023','42501','23514']);
  await reject(client.query("select public.df_link_campaign_room('4SSU','NEW1')"), ['42501','22023','23514']);

  await login(otherMj);
  const foreign = (await campaigns('create',null,'Autre MJ','Privée')).campaign.id;
  await createRoom('FORE',foreign);
  check((await campaigns()).campaigns.length===1 && (await campaigns()).campaigns[0].id===foreign, 'MJ cannot list another MJ’s campaigns');
  await reject(campaigns('update',fresh,'Vol',''), '42501');
  await reject(createRoom('STOL',fresh), '42501');
  await reject(legacyRoom('STOL','4SSU'), '42501');
  await login(player);
  list = await campaigns();
  check(!list.is_mj && list.campaigns.length===1 && list.campaigns[0].id===canonical && !list.campaigns[0].can_manage, 'Player lists only campaigns joined and cannot manage them');
  await reject(campaigns('create',null,'Joueur',''), '42501');
  await reject(campaigns('update',canonical,'Vol',''), '42501');
  await reject(createRoom('PLYR',canonical), '42501');
  await reject(campaigns('room',null,null,null,'FORE'), '42501');
  check((await campaigns('room',null,null,null,'4SSU')).campaign.id===canonical, 'Member can identify the campaign of a joined room');

  // The same player joins another campaign; their old PJ and inventory stay private to Valombre.
  await client.query("insert into public.room_members values('NEW1',$1,'Joueur')", [player]);
  check((await query('pj_sheets','read',{},null,'NEW1')).rows.length===0, 'Fresh campaign exposes no sheets from Valombre');
  check((await query('pj_inventory','read',{},null,'NEW1')).rows.length===0, 'Fresh campaign exposes no inventory from Valombre');
  check((await query('personnages','read',{user_id:player},null,'NEW1')).rows.length===0, 'Same player exposes no previous character in a fresh campaign');
  const roster = (await client.query("select public.df_character_roster('NEW1','list') result")).rows[0].result;
  check(roster.characters.length===0 && roster.selected_character_id===null, 'Fresh campaign roster and selection do not leak another campaign');
  check((await query('pj_sheets','read',{id:original.id},null,'NEW1')).rows.length===0, 'Explicit foreign state UUID exposes no sheet');
  await reject(query('pj_sheets','upsert',{id:original.id},{user_id:player,character_name:'Ilya',sheet_data:data,expected_revision:original.revision},'NEW1'), '42501');
  await reject(query('personnages','update',{character_id:original.sheet_data.character_id},{user_id:player,nom:'Forged outside'},'NEW1'), '42501');
  await reject(query('pj_sheets','upsert',{}, {user_id:player,character_name:'Ilya',sheet_data:data},'NEW1'), '42501');
  await reject(query('pj_inventory','upsert',{}, {user_id:player,character_name:'Ilya',po:42},'NEW1'), '42501');
  check(!(await client.query('select diceforge_v2.can_read($1) allowed', [secondary.id])).rows[0].allowed, 'Archived secondary state cannot be reached by its previous owner');
  const visible = (await query('personnages','read',{user_id:player})).rows[0];
  check(visible.campaign_id===canonical, 'Compatibility character projection supplies campaign ID');
  await login(mj);
  check((await query('pj_sheets','read',{},null,'NEW1')).rows.length===0, 'MJ also sees no foreign campaign sheets in a fresh campaign');
  await login(outsider);
  check((await campaigns()).campaigns.length===0 && !(await campaigns()).is_mj, 'Outsider receives no campaign list');
  await reject(campaigns('room',null,null,null,'4SSU'), '42501');
  await reject(createRoom('OUTS',fresh), '42501');
  await login(null);
  await reject(campaigns(), '42501');
  check(!(await client.query("select has_function_privilege('anon','public.df_campaigns(text,uuid,text,text,text)','EXECUTE') allowed")).rows[0].allowed, 'Anonymous campaign RPC execution denied');
  check(!(await client.query("select has_table_privilege('authenticated','diceforge_v2.campaigns','INSERT') allowed")).rows[0].allowed, 'Direct application campaign creation denied');
  check(!(await client.query("select has_table_privilege('authenticated','diceforge_v2.campaign_rooms','UPDATE') allowed")).rows[0].allowed, 'Direct application relinking denied');
  check(!(await client.query("select exists(select 1 from public.rooms where room_code in ('NONE','ARCH','MISS','MISM','STOL','PLYR','OUTS')) present")).rows[0].present, 'Rejected requests leave no orphan rooms');
  await login(mj);
  await migrate('campaign-management.sql');
  check((await campaigns()).campaigns.find(row=>row.id===fresh).name==='Aurore II', 'Reapplying management preserves campaigns and edits');
  check((await client.query('select bool_and(r.campaign_id=c.campaign_id) ok from public.rooms r join diceforge_v2.campaign_rooms c using(room_code)')).rows[0].ok, 'All final room links agree');
  console.log(`PASS campaign management: ${checks} checks; local PostgreSQL only.`);
} finally {
  if (client) await client.end();
  await engine.stop();
  if (process.platform === 'win32') {
    assert.equal(path.dirname(databaseDir), path.resolve(os.tmpdir()));
    assert(path.basename(databaseDir).startsWith('diceforge-campaign-test-'));
    await fs.rm(databaseDir,{recursive:true,force:true,maxRetries:15,retryDelay:200});
  }
}
