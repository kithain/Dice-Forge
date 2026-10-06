// Isolated PostgreSQL tests for the creation/progression boundary.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const runtime = process.argv[2];
if (!runtime) throw Error('Provide the embedded-postgres runtime directory.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.resolve(runtime, 'node_modules/embedded-postgres/dist/index.js')));
const listener = net.createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const databaseDir = path.resolve(os.tmpdir(), `diceforge-creation-test-${randomUUID()}`);
const engine = new EmbeddedPostgres({ databaseDir,
  user: 'postgres', password: randomUUID(), port, persistent: process.platform === 'win32',
  initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1', '-c', 'log_min_error_statement=panic'] });
let client;
let checks = 0;
const check = (value, message) => { assert(value, message); checks++; };
try {
 await engine.initialise(); await engine.start(); await engine.createDatabase('creation_test');
 client = engine.getPgClient('creation_test', '127.0.0.1'); await client.connect();
 await client.query(`create role anon; create role authenticated;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  create table public.rooms(room_code text primary key,owner_id uuid);
  create table public.room_members(room_code text,user_id uuid);`);
 for (const file of ['schema.sql','api.sql','save-fixes.sql']) await client.query(await fs.readFile(path.join(root,'migrations/character-v2',file),'utf8'));
 const catalog = JSON.parse(await fs.readFile(path.join(root,'migrations/character-v2/catalog.json'),'utf8'));
 for (const row of catalog.skills) await client.query('insert into diceforge_v2.skill_catalog(id,name,legacy_index) values($1,$2,$3)',[row.id,row.name,Object.values(catalog.legacy_catalogs)[0].indexOf(row.id) >= 0 ? Object.values(catalog.legacy_catalogs)[0].indexOf(row.id) : null]);
 for (const row of catalog.spells) await client.query('insert into diceforge_v2.spell_catalog(id,name) values($1,$2)',[row.id,row.name]);
 const uid=randomUUID(), outsider=randomUUID();
 await client.query('insert into auth.users values($1),($2)',[uid,outsider]);
 await client.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 await client.query("insert into public.rooms values('TEST',$1),('DEST',$1)",[uid]);
 await client.query("insert into public.room_members values('TEST',$1),('DEST',$1)",[uid]);
 await client.query('update diceforge_v2.configuration set enabled=true');
 await client.query("select public.df_link_campaign_room(null,'TEST'),public.df_link_campaign_room(null,'DEST')");
 const rpc=async(resource,operation,filters,payload,room='TEST') => (await client.query('select public.df_character_query($1,$2,$3,$4,$5) result',[resource,operation,filters,payload,room])).rows[0].result;
 const read=async(id,room='TEST') => (await rpc('pj_sheets','read',{id},null,room)).rows[0];
 const write=async(row,data,room='TEST') => (await rpc('pj_sheets','upsert',{id:row.id},{user_id:uid,character_name:row.character_name,sheet_data:data,expected_revision:row.revision},room)).rows[0];
 const create=async(name,data) => {
  await rpc('personnages','insert',{}, {user_id:uid,nom:name,player_name:'Player',intelligence:16});
  return (await rpc('pj_sheets','upsert',{}, {user_id:uid,character_name:name,sheet_data:data})).rows[0];
 };
 const template={fields:{name:'A',profession:'Sorcier',race:'Humain',skillProfessionalPool:'325',notes:'Preserved'},stats:{intelligence:16,force:12},
  skills:[{id:'skill.estimation',base:15,points:25,score:40,checked:false}],
  spells:[{id:'spell.feu',name:'Feu',points:20,checked:false},{name:'',points:'0',checked:false}],weapons:[]};
 let legacy=await create('A',template);
 const malformed={...structuredClone(template),fields:{...template.fields,name:'Review'},spells:[{name:'',points:'59',checked:true}]};
 let review=await create('Review',malformed);
 let originals=[];
 if(process.argv[3] && process.argv[3]!=='-') {
  const snapshot=JSON.parse(await fs.readFile(process.argv[3],'utf8'));
  for(const [index,row] of snapshot.pj_sheets.entries()) {
   const saved=await create(`Real fixture ${index+1}`,row.sheet_data);
   originals.push({id:saved.id,data:saved.sheet_data});
  }
 }
 const upgrade=await fs.readFile(path.join(root,'migrations/character-v2/creation-lock.sql'),'utf8');
 await client.query(upgrade);
 legacy=await read(legacy.id); review=await read(review.id);
 check(legacy.sheet_data.creation.phase==='play','Existing valid state inherited and locked');
 check(legacy.sheet_data.skills[0].allocation.inherited_points===25,'Historical points are not called creation or XP');
 check(legacy.sheet_data.progression.xp_points===0 && legacy.sheet_data.progression.learning_points===0,'No free points from migration');
 check(review.sheet_data.creation.phase==='legacy_review' && review.sheet_data.spells.some(s=>!s.name && s.points==='59'),'Unknown spell points flagged and preserved');
 const validation=async(row,revision=row.revision,room='TEST') => (await client.query('select public.df_validate_creation($1,$2,$3) result',[row.id,room,revision])).rows[0].result;
 const reject=async(promise,code) => { await assert.rejects(promise,e=>e.code===code); checks++; };
 await reject(write(legacy,{...legacy.sheet_data,fields:{...legacy.sheet_data.fields,skillProfessionalPool:'999'}}),'42501');
 await reject(write(legacy,{...legacy.sheet_data,stats:{...legacy.sheet_data.stats,intelligence:20}}),'42501');
 await reject(rpc('personnages','update',{user_id:uid},{user_id:uid,nom:'A',player_name:'Player',intelligence:20}),'42501');
 for(const points of [0,26]) {
  const data=structuredClone(legacy.sheet_data);data.skills[0].points=points;data.skills[0].score=15+points;
  await reject(write(legacy,data),'42501');
 }
 const remove=structuredClone(legacy.sheet_data);remove.spells=[];
 await reject(write(legacy,remove),'42501');
 const forged=structuredClone(legacy.sheet_data);forged.creation={phase:'draft'};forged.progression={xp_points:999};forged.skills[0].allocation={creation_points:0,xp_points:999};
 const projected=await write(legacy,forged);legacy=projected;
 check(projected.sheet_data.creation.phase==='play' && projected.sheet_data.progression.xp_points===0 && projected.sheet_data.skills[0].allocation.inherited_points===25,'Client metadata is not authority');
 const permitted=structuredClone(legacy.sheet_data);permitted.skills[0].checked=true;permitted.spells[0].checked=true;permitted.fields.notes='Changed notes';
 legacy=await write(legacy,permitted);
 check(legacy.sheet_data.skills[0].checked && legacy.sheet_data.spells[0].checked && legacy.sheet_data.fields.notes==='Changed notes','Checks and notes remain writable');
 await reject(write({...legacy,revision:legacy.revision-1},legacy.sheet_data),'40001');
 // Independent inventory revisions still work while initial allocations are locked.
 const inv=(await rpc('pj_inventory','read',{id:legacy.id},null)).rows[0];
 await rpc('pj_inventory','upsert',{id:legacy.id},{user_id:uid,character_name:'A',expected_revision:inv.revision,po:2,pa:1,pc:0,weapons:[],armors:[],equipment:[],consumables:[],miscellaneous:[]});
 check((await rpc('pj_inventory','read',{id:legacy.id},null)).rows[0].po===2,'Inventory remains writable');
 let draft=await create('Draft',{...structuredClone(template),fields:{...template.fields,name:'Draft'}});
 check(draft.sheet_data.creation.phase==='draft','New sheet saves as draft');
 const edited=structuredClone(draft.sheet_data);edited.skills[0].points=30;edited.skills[0].score=45;
 draft=await write(draft,edited);
 await reject(validation(draft,draft.revision-1),'40001');
 await client.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider]);
 await reject(validation(draft),'42501');
 await client.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 await reject(validation(draft,draft.revision,'DEST'),'42501');
 const validated=await validation(draft);draft=await read(draft.id);
 check(!validated.already_validated && draft.sheet_data.creation.phase==='play' && draft.sheet_data.skills[0].allocation.creation_points===30,'Explicit validation freezes creation allocations');
 const beforeEvents=Number((await client.query('select count(*) n from diceforge_v2.point_events where state_id=$1',[draft.id])).rows[0].n);
 check((await validation(draft)).already_validated,'Repeated validation is idempotent');
 check(Number((await client.query('select count(*) n from diceforge_v2.point_events where state_id=$1',[draft.id])).rows[0].n)===beforeEvents,'Validation creates one event');
 await reject(client.query("update diceforge_v2.point_events set payload='{}' where state_id=$1",[draft.id]),'42501');
 const maxed={...structuredClone(template),fields:{...template.fields,name:'Maxed'},skills:[{id:'skill.estimation',base:15,points:85,score:100,checked:false}],spells:[]};
 let capped=await create('Maxed',maxed);await validation(capped);checks++;
 let excessive=await create('Excessive',{...structuredClone(maxed),skills:[{id:'skill.estimation',base:15,points:86,score:101,checked:false}]});
 await reject(validation(excessive),'22023');
 let overbudget=await create('Overbudget',{...structuredClone(template),fields:{...template.fields,skillProfessionalPool:'0'},skills:[{id:'skill.estimation',base:0,points:161,score:100,checked:false}],spells:[]});
 await reject(validation(overbudget),'22023');
 // Simulate an import into an already locked destination; clone cannot reopen it.
 const destination=(await rpc('pj_sheets','upsert',{}, {user_id:uid,character_name:'A',sheet_data:template},'DEST')).rows[0];
 await validation(destination,destination.revision,'DEST');
 const importData=structuredClone(legacy.sheet_data);importData.skills[0].points=0;importData.skills[0].score=15;
 await reject(write(await read(destination.id,'DEST'),importData,'DEST'),'42501');
 for(const {id,data} of originals) {
  const now=(await read(id)).sheet_data;
  for(const key of ['fields','stats','weapons']) assert.deepEqual(now[key],data[key]);
  for(const key of ['skills','spells']) assert.deepEqual(now[key].map(({allocation,...row})=>row),data[key]);
  check(now.creation.phase==='play','Actual audited fixture remains unchanged and eligible');
 }
 const stable=(await read(legacy.id)).sheet_data;
 const eventCount=Number((await client.query('select count(*) n from diceforge_v2.point_events')).rows[0].n);
 await client.query(upgrade);
 assert.deepEqual((await read(legacy.id)).sheet_data,stable);
 check(Number((await client.query('select count(*) n from diceforge_v2.point_events')).rows[0].n)===eventCount,'Repeated upgrade preserves data, revisions and events');
 check(!(await client.query("select has_function_privilege('anon','public.df_validate_creation(uuid,text,bigint)','EXECUTE') allowed")).rows[0].allowed,'Anonymous validation denied');
 check(!(await client.query("select has_table_privilege('authenticated','diceforge_v2.point_events','INSERT') allowed")).rows[0].allowed,'No direct XP/acquisition event writes');
 check(!(await client.query("select has_function_privilege('authenticated','diceforge_v2.capture_initial_allocations(uuid,text)','EXECUTE') allowed")).rows[0].allowed,'Private baseline helper inaccessible');
 if(process.env.DF_TEST_PROGRESSION==='1') {
  const { runProgressionChecks }=await import('./progression_sql_checks.mjs');
  await runProgressionChecks({client,engine,root,uid,outsider,legacy,capped,draft,review,rpc,read,write,check,reject});
 }
 if(process.env.DF_TEST_LEARNING==='1') {
  const {runLearningChecks}=await import('./spell_learning_sql_checks.mjs');
  await runLearningChecks({client,engine,root,uid,outsider,rpc,read,write,check,reject});
 }
 if(process.env.DF_TEST_ROSTER==='1') {
  const {runRosterChecks}=await import('./character_roster_sql_checks.mjs');
  await runRosterChecks({client,engine,root,uid,outsider,rpc,read,write,check,reject});
 }
 if(process.env.DF_TEST_RECIPE==='1') {
  const baseline=(await client.query('select id,diceforge_v2.sheet(id) sheet,diceforge_v2.inventory(id) inventory from diceforge_v2.states order by id')).rows;
  const migration=await fs.readFile(path.join(root,'migrations/character-v2/recipe-corrections.sql'),'utf8');
  await client.query(migration);
  const first=(await client.query('select id,diceforge_v2.sheet(id) sheet,diceforge_v2.inventory(id) inventory from diceforge_v2.states order by id')).rows;
  for(let i=0;i<baseline.length;i++) {
   for(const key of ['fields','stats','skills','spells','creation']) assert.deepEqual(first[i].sheet[key],baseline[i].sheet[key],`Preserve historical ${key}`);
   check(['po','pa','pc'].every(key=>first[i].inventory[key]===baseline[i].inventory[key]),'Wallet untouched by legacy equipment transfer');
   for(const category of ['weapons','armors','equipment','consumables','miscellaneous']) {
    check(baseline[i].inventory[category].every(item=>first[i].inventory[category].some(after=>after.id===item.id && JSON.stringify(after)===JSON.stringify(item))),'Existing inventory rows preserved');
   }
  }
  await client.query(migration);
  assert.deepEqual((await client.query('select id,diceforge_v2.sheet(id) sheet,diceforge_v2.inventory(id) inventory from diceforge_v2.states order by id')).rows,first,'Repeated migration does not duplicate or rewrite inventory');
  check(!(await client.query("select has_function_privilege('anon','public.df_roll_skill_test(uuid,text,text,text,text,integer,uuid)','EXECUTE') allowed")).rows[0].allowed,'Anonymous trusted rolls denied');
  check(!(await client.query("select has_table_privilege('authenticated','diceforge_v2.skill_roll_receipts','INSERT') allowed")).rows[0].allowed,'Receipt writes private');
 }
 if(process.env.DF_TEST_GENERATION==='1') {
  await client.query('alter table public.room_members add column if not exists player_name text default \'Player\'');
  await client.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  const before=(await client.query('select id,stats,fields from diceforge_v2.states order by id')).rows;
  const migration=await fs.readFile(path.join(root,'migrations/character-v2/character-generation.sql'),'utf8');
  await client.query(migration);
  assert.deepEqual((await client.query('select id,stats,fields from diceforge_v2.states order by id')).rows,before);
  check(true,'Existing characteristics and fields preserved');
  const generate=async(op,id,details,adjustments={},request=randomUUID())=>(await client.query('select public.df_generate_character($1,$2,$3,$4,$5,$6) result',['TEST',op,id,details,adjustments,request])).rows[0].result;
  await client.query("select public.df_character_roster('TEST','new')");
  const details={nom:'Generated securely',espece:'Nain',profession:'Guerrier',richesse:'Moyen'};
  const request=randomUUID();
  const generated=await generate('create',null,details,{},request);
  check(generated.generation.serverGenerated,'Authoritative generation');
  assert.deepEqual(await generate('create',null,details,{},request),generated);
  check(true,'Retry does not create another character or reroll');
  check(Object.values(generated.generation.stats).every(s=>s.base>=3&&s.base<=21&&s.rolls.every(d=>d>=1&&d<=6)),'Scores and dice in range');
  let row=await read(generated.state_id);
  await reject(write(row,{...row.sheet_data,stats:{...row.sheet_data.stats,intelligence:999}}),'42501');
  check(true,'Forged draft characteristic denied');
  await reject(rpc('personnages','update',{character_id:generated.character_id},{...generated,intelligence:21}),'42501');
  check(true,'Old generator endpoint cannot forge stats');
  await reject(generate('save',generated.character_id,details,{force:3}),'22023');
  check(true,'Unbalanced adjustment denied');
  await reject(generate('save',generated.character_id,details,{force:4,constitution:-4}),'22023');
  check(true,'More than three points denied');
  const keys=Object.keys(generated.generation.stats),plus=keys.find(k=>generated.generation.stats[k].base<21);
  const minus=keys.find(k=>k!==plus&&generated.generation.stats[k].base>3);
  const adjusted=await generate('save',generated.character_id,details,{[plus]:1,[minus]:-1});
  check(adjusted.generation.stats[plus].adjust===1&&adjusted.generation.stats[minus].adjust===-1,'Allowed point transfer saved');
  check((await generate('reroll',generated.character_id,details)).rerolls_used===1,'First reroll saved');
  check((await generate('reroll',generated.character_id,details)).rerolls_used===2,'Second reroll saved');
  await reject(generate('reroll',generated.character_id,details),'22023');
  check(true,'Third reroll denied');
  await client.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider]);
  await reject(generate('save',generated.character_id,details),'42501');
  check(true,'Other player denied');
  await client.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  row=await read(generated.state_id);
  await client.query('select public.df_validate_creation($1,$2,$3)',[row.id,'TEST',row.revision]);
  await reject(generate('reroll',generated.character_id,details),'42501');
  check(true,'Validated character cannot reroll');
  await client.query("select public.df_character_roster('TEST','new')");
  const second=await generate('create',null,{...details,nom:details.nom});
  check(second.character_id!==generated.character_id,'New character with same name has independent identity');
  check(!!(await read(generated.state_id)),'Previous character preserved');
  await client.query(migration);
  check(true,'Generation migration repeatable');
 }
 if(process.env.DF_TEST_BUDGET==='1') {
  const generate=async(name)=>(await client.query('select public.df_generate_character($1,$2,null,$3,$4,$5) result',['TEST','create',{nom:name,espece:'Humain',profession:'Guerrier',richesse:'Moyen'},{},randomUUID()])).rows[0].result;
  await client.query("select public.df_character_roster('TEST','new')");
  const generated=await generate('Budget regression');
  let row=await read(generated.state_id);
  const allowed=(await client.query("select skills from diceforge_v2.profession_skills where profession='Guerrier'")).rows[0].skills;
  const inside=catalog.skills.filter(s=>allowed.includes(s.id)),outside=catalog.skills.filter(s=>!allowed.includes(s.id));
  const skills=(ids,points)=>ids.map((s,i)=>({id:s.id,base:0,points:points[i],score:points[i],checked:false}));
  // Preserve a previously accepted invalid draft rather than silently correcting it.
  let invalid={...row.sheet_data,skills:[...skills(inside.slice(0,2),[54,55]),...skills(outside.slice(0,4),[96,97,97,97])]};
  row=await write(row,invalid);
  const before=(await client.query('select id,diceforge_v2.sheet(id) sheet from diceforge_v2.states order by id')).rows;
  const migration=await fs.readFile(path.join(root,'migrations/character-v2/creation-budget.sql'),'utf8');
  await client.query(migration);
  assert.deepEqual((await client.query('select id,diceforge_v2.sheet(id) sheet from diceforge_v2.states order by id')).rows,before);
  check(true,'Existing invalid draft and real sheets preserved on installation');
  await reject(write(row,row.sheet_data),'22023');
  check((await read(row.id)).revision===row.revision,'Rejected draft save does not change revision or data');
  await reject(validation(row),'22023');
  check((await read(row.id)).sheet_data.creation.phase==='draft','Invalid draft cannot enter play');
  await reject(write(row,{...row.sheet_data,fields:{...row.sheet_data.fields,skillProfessionalPool:'999'}}),'42501');
  const personal=Number(row.sheet_data.stats.intelligence)*10;
  let valid={...row.sheet_data,skills:[...skills(inside.slice(0,4),[100,100,100,25]),...skills(outside.slice(0,3),[Math.min(100,personal),Math.max(0,Math.min(100,personal-100)),Math.max(0,personal-200)])]};
  row=await write(row,valid);
  check((await read(row.id)).revision===row.revision,'Corrected draft saved at exact combined budget');
  let overTotal=structuredClone(row.sheet_data); overTotal.skills.find(s=>s.id===inside[3].id).points++;overTotal.skills.find(s=>s.id===inside[3].id).score++;
  await reject(write(row,overTotal),'22023');
  let overPersonal={...row.sheet_data,skills:[...skills(outside.slice(0,3),[Math.min(100,personal+1),Math.max(0,Math.min(100,personal+1-100)),Math.max(0,personal+1-200)])]};
  await reject(write(row,overPersonal),'22023');
  check(true,'Outside pool rejected even with professional points unused');
  // First add more to one row and only later lower another: validate the final transaction.
  let redistribute=structuredClone(row.sheet_data);
  redistribute.skills.find(s=>s.id===inside[0].id).points=50;redistribute.skills.find(s=>s.id===inside[0].id).score=50;
  redistribute.skills.find(s=>s.id===inside[3].id).points=75;redistribute.skills.find(s=>s.id===inside[3].id).score=75;
  redistribute.skills.sort((a,b)=>Number(b.id===inside[3].id)-Number(a.id===inside[3].id));
  row=await write(row,redistribute);
  check(true,'Valid redistribution checked after all rows, not mid-save');
  let spellOver={...row.sheet_data,spells:[{id:'spell.feu',name:'Feu',points:1,checked:false}]};
  await reject(write(row,spellOver),'22023');
  check(true,'Spell cannot bypass shared skill budget');
  await validation(row);
  row=await read(row.id);
  check(row.sheet_data.creation.phase==='play','Exact valid budget accepted for play');
  await write(row,{...row.sheet_data,fields:{...row.sheet_data.fields,notes:'Normal notes in play'}});
  check(true,'In-play notes still save after budget validation');
  await client.query("select public.df_character_roster('TEST','new')");
  const fresh=await generate('Empty budget generation');
  check(!!fresh.generation.serverGenerated,'Fresh generation still works with deferred draft checks');
  const freshRow=await read(fresh.state_id);
  let scoreOver={...freshRow.sheet_data,skills:[{id:inside[0].id,base:50,points:51,score:101}]};
  await reject(write(freshRow,scoreOver),'22023');
  await client.query(migration);
  check(true,'Budget migration repeatable');
 }
 if(process.env.DF_TEST_CHECKED_SAVE==='1') {
  const migration=await fs.readFile(path.join(root,'migrations/character-v2/checked-save.sql'),'utf8');
  const before=(await client.query('select id,diceforge_v2.sheet(id) sheet from diceforge_v2.states order by id')).rows;
  await client.query(migration);
  assert.deepEqual((await client.query('select id,diceforge_v2.sheet(id) sheet from diceforge_v2.states order by id')).rows,before);
  check(true,'Checked-save upgrade preserves all sheets');
  await client.query("select public.df_character_roster('TEST','new')");
  const generated=(await client.query('select public.df_generate_character($1,$2,null,$3,$4,$5) result',['TEST','create',{nom:'Checked save regression',espece:'Humain',profession:'Sorcier',richesse:'Moyen'},{},randomUUID()])).rows[0].result;
  legacy=await read(generated.state_id);
  legacy=await write(legacy,{...legacy.sheet_data,skills:[{id:'skill.estimation',base:15,points:25,score:40,checked:false},{id:'skill.bagarre',base:25,points:0,score:25,checked:false}],spells:[{id:'spell.feu',name:'Feu',points:20,checked:false}]});
  await validation(legacy);legacy=await read(legacy.id);
  // Both targets must first get their check through the trusted server path.
  await client.query("select set_config('diceforge_v2.marking_check','trusted_roll',false)");
  await client.query("update diceforge_v2.skills set checked=true where state_id=$1 and skill_id='skill.estimation'",[legacy.id]);
  await client.query('update diceforge_v2.spells set checked=true where state_id=$1',[legacy.id]);
  await client.query("select set_config('diceforge_v2.marking_check','',false)");
  legacy=await read(legacy.id);
  legacy=await write(legacy,{...legacy.sheet_data,fields:{...legacy.sheet_data.fields,notes:'Checked notes'}});
  check(legacy.sheet_data.skills[0].checked && legacy.sheet_data.spells[0].checked && legacy.sheet_data.fields.notes==='Checked notes','Saving existing trusted skill and spell checks succeeds');
  let unmarked=await read(legacy.id);
  const forged=structuredClone(unmarked.sheet_data);forged.skills.find(s=>s.id==='skill.bagarre').checked=true;
  await reject(write(unmarked,forged),'42501');
  check((await read(unmarked.id)).revision===unmarked.revision,'Forged check still rejected atomically');
  await client.query("select diceforge_v2.session_open($1,'TEST')",[legacy.id]);
  legacy=await read(legacy.id);
  await client.query("select set_config('diceforge_v2.marking_check','trusted_roll',false)");
  await client.query('update diceforge_v2.skills set checked=true where state_id=$1',[legacy.id]);
  await client.query('update diceforge_v2.spells set checked=true where state_id=$1',[legacy.id]);
  await client.query("select set_config('diceforge_v2.marking_check','',false)");
  legacy=await read(legacy.id);
  legacy=await write(legacy,legacy.sheet_data);
  check(legacy.sheet_data.skills[0].checked && legacy.sheet_data.spells[0].checked,'Trusted checks survive save during open XP session');
  const cleared=structuredClone(legacy.sheet_data);cleared.skills[0].checked=false;
  await reject(write(legacy,cleared),'42501');
  const clearedSpell=structuredClone(legacy.sheet_data);clearedSpell.spells[0].checked=false;
  await reject(write(legacy,clearedSpell),'42501');
  await client.query(migration);
  check(true,'Checked-save upgrade repeatable');
 }
 if(process.env.DF_TEST_COMPLETE_BUDGET==='1') {
  const migration=await fs.readFile(path.join(root,'migrations/character-v2/complete-creation-budget.sql'),'utf8');
  const before=(await client.query('select id,diceforge_v2.sheet(id) sheet from diceforge_v2.states order by id')).rows;
  await client.query(migration);
  assert.deepEqual((await client.query('select id,diceforge_v2.sheet(id) sheet from diceforge_v2.states order by id')).rows,before);
  check(true,'Complete-budget migration preserves existing validated and incomplete sheets');
  await client.query("select public.df_character_roster('TEST','new')");
  const generated=(await client.query('select public.df_generate_character($1,$2,null,$3,$4,$5) result',['TEST','create',{nom:'Complete budget regression',espece:'Humain',profession:'Guerrier',richesse:'Moyen'},{},randomUUID()])).rows[0].result;
  let row=await read(generated.state_id);const personal=Number(row.sheet_data.stats.intelligence)*10;
  const inside=['skill.bagarre','skill.defense','skill.lutte','skill.arme_de_melee'];
  const outside=['skill.estimation','skill.medecine','skill.alchimie'];
  const skills=(ids,points)=>ids.map((id,i)=>({id,base:0,points:points[i],score:points[i],checked:false}));
  const complete={...row.sheet_data,skills:[...skills(inside,[100,100,100,25]),...skills(outside,[Math.min(100,personal),Math.max(0,Math.min(100,personal-100)),Math.max(0,personal-200)])],spells:[]};
  for(const remaining of [110,1]) {
   const partial=structuredClone(complete);let remove=remaining;
   for(const skill of partial.skills){const amount=Math.min(remove,skill.points);skill.points-=amount;skill.score-=amount;remove-=amount;}
   row=await write(row,partial);
   check((await read(row.id)).sheet_data.creation.phase==='draft',`Draft with ${remaining} unspent points remains saveable`);
   const snapshot=await read(row.id);
   const eventCount=Number((await client.query('select count(*) n from diceforge_v2.point_events where state_id=$1',[row.id])).rows[0].n);
   await assert.rejects(validation(row),e=>e.code==='22023' && e.message.includes(`${remaining} point`));checks++;
   assert.deepEqual(await read(row.id),snapshot);
   check(Number((await client.query('select count(*) n from diceforge_v2.point_events where state_id=$1',[row.id])).rows[0].n)===eventCount,'Rejected validation creates no event or revision');
   check(Number((await client.query('select count(*) n from diceforge_v2.initial_allocations where state_id=$1',[row.id])).rows[0].n)===0,'Rejected validation leaves no frozen initial allocations');
   check(Number((await client.query('select count(*) n from diceforge_v2.xp_sessions where state_id=$1',[row.id])).rows[0].n)===0,'Rejected validation opens no XP session');
  }
  row=await write(row,complete);await validation(row);row=await read(row.id);
  check(row.sheet_data.creation.phase==='play','Fully allocated valid sheet can enter play');
  check((await validation(row)).already_validated,'Fully allocated validation remains idempotent');
  await client.query(migration);
  check(true,'Complete-budget migration repeatable');
 }
 if(process.env.DF_TEST_UNPLAYED_PRESETS==='1') {
  const {runUnplayedPresetChecks}=await import('./unplayed_presets_sql_checks.mjs');
  await runUnplayedPresetChecks({client,root,uid,outsider,read,write,check,reject});
 }
 if(process.env.DF_TEST_DELETION==='1') {
  const {runDeletionChecks}=await import('./character_deletion_sql_checks.mjs');
  await runDeletionChecks({client,engine,root,uid,outsider,rpc,read,check,reject});
 }
 if(process.env.DF_TEST_CAMPAIGN_COPY==='1') {
  const {runCampaignCopyChecks}=await import('./campaign_copy_sql_checks.mjs');
  await runCampaignCopyChecks({client,root,uid,outsider,check});
 }
 if(process.env.DF_TEST_VERBAL_OBS==='1') {
  const {runVerbalCloudChecks}=await import('./verbal_cloud_sql_checks.mjs');
  await runVerbalCloudChecks({client,root,uid,outsider,check});
 }
 console.log(`PASS creation/progression boundary: ${checks} checks, ${originals.length} real fixtures preserved; local PostgreSQL only.`);
} catch(error) {
 console.error(error);
 throw error;
} finally {
 if(client) await client.end();
 await engine.stop();
 if (process.platform === 'win32') {
  // Windows may briefly retain a database-file handle after PostgreSQL exits.
  assert.equal(path.dirname(databaseDir), path.resolve(os.tmpdir()));
  assert(path.basename(databaseDir).startsWith('diceforge-creation-test-'));
  await fs.rm(databaseDir,{recursive:true,force:true,maxRetries:15,retryDelay:200});
 }
}
