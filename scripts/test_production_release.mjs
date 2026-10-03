// Repeat the exact incremental deployment and restoration on a local copy only.
// Usage: node scripts/test_production_release.mjs <embedded-postgres-runtime> <private-release-directory>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const [runtime, directory] = process.argv.slice(2);
if (!runtime || !directory) throw Error('Expected runtime and private release directory');
const out = path.resolve(directory);
const snapshot = JSON.parse(await fs.readFile(path.join(out,'before/server-snapshot.json'),'utf8'));
const sql = name => fs.readFile(path.join(out,'sql',name),'utf8');
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.resolve(runtime,'node_modules/embedded-postgres/dist/index.js')));
const listener = net.createServer();
await new Promise(resolve => listener.listen(0,'127.0.0.1',resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const engine = new EmbeddedPostgres({databaseDir:path.join(out,'rehearsal-'+randomUUID()),user:'postgres',password:randomUUID(),port,persistent:process.platform==='win32',initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1','-c','log_min_error_statement=panic']});
let client;
let checks = 0;
const check = (value,label) => { assert(value,label); checks++; console.log('PASS',label); };
const normalized = value => JSON.stringify(value.map(r=>JSON.stringify(r)).sort());
const quote = name => '"'+name.replaceAll('"','""')+'"';
async function tableRows(key) {
 return (await client.query('select to_jsonb(r) as row from '+key.split('.').map(quote).join('.')+' r')).rows.map(r=>r.row);
}
async function functions() {
 return (await client.query("select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args,pg_get_functiondef(p.oid) as definition,p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','diceforge_v2') order by 1,2,3")).rows;
}
async function structure() {
 return (await client.query(`select jsonb_build_object(
 'triggers',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','diceforge_v2')),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','diceforge_v2')),
 'tables',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','v') and n.nspname in ('public','diceforge_v2')),
 'views',(select jsonb_agg(to_jsonb(v) order by schemaname,viewname) from pg_views v where schemaname in ('public','diceforge_v2')),
 'constraints',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',k.conname,'definition',pg_get_constraintdef(k.oid)) order by n.nspname,c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','diceforge_v2'))
 ) result`)).rows[0].result;
}
try {
 await engine.initialise(); await engine.start(); await engine.createDatabase('release_copy');
 client=engine.getPgClient('release_copy','127.0.0.1'); await client.connect();
 await client.query("set timezone='UTC';");
 await client.query(await sql('bootstrap-copy.sql'));
 const initialFunctions=await functions();
 const initialStructure=await structure();
 const before={};
 for(const key of Object.keys(snapshot.data)) before[key]=await tableRows(key);
 await client.query(await sql('deploy-incremental.sql'));
 check(true,'Exact production incremental SQL applied on the fresh copy');
 for(const key of Object.keys(before).filter(k=>!['diceforge_v2.states','diceforge_v2.items'].includes(k)))
  check(normalized(await tableRows(key))===normalized(before[key]),'Preserved '+key);
 const states=await tableRows('diceforge_v2.states');
 check(states.length===before['diceforge_v2.states'].length,'All permanent campaign states retained');
 for(const old of before['diceforge_v2.states']) {
  const current=states.find(r=>r.id===old.id);
  for(const field of ['fields','stats','legacy_sheet_data','legacy_markdown','legacy_inventory','campaign_id','character_id'])
   check(JSON.stringify(current[field])===JSON.stringify(old[field]),'State '+field+' retained');
 }
 const items=await tableRows('diceforge_v2.items');
 check(before['diceforge_v2.items'].every(old=>items.some(r=>JSON.stringify(r)===JSON.stringify(old))),'Every original inventory item retained');
 const real = snapshot.data['diceforge_v2.characters'].filter(c=>['Gram Tolgarinn','Ilyandra Vaelith (dite Ilya)','Thokk Le Briseur'].includes(c.name));
 let smoke = ['begin;'];
 for(const c of real) {
  const st=states.find(r=>r.character_id===c.id);
  smoke.push(`select set_config('request.jwt.claim.sub','${c.owner_user_id}',true); set local role authenticated;`);
  smoke.push(`do $$ declare result jsonb; row_data jsonb; changed jsonb; begin
   result:=public.df_character_query('pj_sheets','read',jsonb_build_object('id','${st.id}'),null,'4SSU');
   row_data:=result->'rows'->0;
   if row_data is null or row_data->>'character_id' is distinct from '${c.id}' then raise exception 'Lecture de fiche échouée'; end if;
   changed:=jsonb_set(row_data->'sheet_data','{fields,notes}',to_jsonb(coalesce(row_data->'sheet_data'->'fields'->>'notes','')||E'\n[verification de livraison annulee]'));
   result:=public.df_character_query('pj_sheets','upsert',jsonb_build_object('id','${st.id}'),jsonb_build_object('user_id','${c.owner_user_id}','character_name',row_data->>'character_name','expected_revision',row_data->'revision','sheet_data',changed),'4SSU');
   if result ? 'error' or result ? 'code' then raise exception 'Ecriture de fiche échouée : %',result; end if;
   result:=public.df_character_query('pj_sheets','read',jsonb_build_object('id','${st.id}'),null,'4SSU');
   if result->'rows'->0->'sheet_data'->'fields'->>'notes' not like '%[verification de livraison annulee]' then raise exception 'Ecriture non relue'; end if;
  end $$; reset role;`);
 }
 smoke.push('rollback;', "select 'authenticated reads and writes rolled back' as status;");
 const smokeSql=smoke.join('\n');
 await fs.writeFile(path.join(out,'sql/verify-authenticated.sql'),smokeSql);
 const dataAfterMigration={};
 for(const key of Object.keys(snapshot.data)) dataAfterMigration[key]=await tableRows(key);
 await client.query(smokeSql);
 check(true,'Authenticated reads and writes verified for the three real characters');
 for(const key of Object.keys(dataAfterMigration)) assert.equal(normalized(await tableRows(key)),normalized(dataAfterMigration[key]),'Smoke test did not roll back '+key);
 check(true,'Authenticated verification leaves campaign data unchanged');
 const releaseManifest=JSON.parse(await fs.readFile(path.join(out,'sql/manifest.json'),'utf8'));
 if(releaseManifest.migrations.includes('character-deletion.sql')) {
  const campaign=snapshot.data['diceforge_v2.campaigns'].find(c=>snapshot.data['diceforge_v2.campaign_rooms'].some(r=>r.campaign_id===c.id&&r.room_code==='4SSU'));
  assert(campaign,'Missing target campaign');
  const deletionSql=`begin;
select set_config('request.jwt.claim.sub','${campaign.owner_user_id}',true); set local role authenticated;
do $$ declare generated jsonb; roster jsonb; state_id uuid; character_id uuid; begin
 roster:=public.df_character_roster('4SSU','list');
 if not coalesce((roster->>'is_mj')::boolean,false) then raise exception 'Contrôle MJ échoué'; end if;
 perform public.df_character_roster('4SSU','new');
 generated:=public.df_generate_character('4SSU','create',null,'{"nom":"Vérification temporaire suppression","espece":"Humain","profession":"Guerrier","richesse":"Moyen"}','{}',gen_random_uuid());
 character_id:=(generated->>'character_id')::uuid;
 state_id:=(generated->>'state_id')::uuid;
 if state_id is null or character_id is null then raise exception 'Génération temporaire échouée'; end if;
 roster:=public.df_character_roster('4SSU','delete',character_id);
 if not exists(select 1 from jsonb_array_elements(roster->'deleted_characters') e where e->>'character_id'=character_id::text) then raise exception 'Corbeille MJ absente'; end if;
 if exists(select 1 from jsonb_array_elements(roster->'characters') e where e->>'character_id'=character_id::text) then raise exception 'Personnage encore proposé'; end if;
 if jsonb_array_length(public.df_character_query('pj_sheets','read',jsonb_build_object('id',state_id),null,'4SSU')->'rows')<>0 then raise exception 'Fiche supprimée encore lisible'; end if;
 roster:=public.df_character_roster('4SSU','restore',character_id);
 if not exists(select 1 from jsonb_array_elements(roster->'characters') e where e->>'character_id'=character_id::text and e->>'status'='active') then raise exception 'Restauration échouée'; end if;
 if jsonb_array_length(public.df_character_query('pj_sheets','read',jsonb_build_object('id',state_id),null,'4SSU')->'rows')<>1 then raise exception 'Fiche restaurée illisible'; end if;
end $$;
reset role; rollback;
select 'GM deletion and restore verified; temporary character and changes rolled back' as status;`;
  await fs.writeFile(path.join(out,'sql/verify-deletion.sql'),deletionSql);
  await client.query(deletionSql);
  for(const key of Object.keys(dataAfterMigration)) assert.equal(normalized(await tableRows(key)),normalized(dataAfterMigration[key]),'Deletion check did not roll back '+key);
  check(Number((await client.query('select count(*) n from diceforge_v2.character_deletions')).rows[0].n)===0,'Production deletion smoke test rolls back its synthetic character and trash');
 }
 await assert.rejects(client.query(await sql('restore-before-release.sql')),e=>e.message.includes('non armée'));
 await client.query('rollback;');
 check(true,'Restoration refused without explicit arming');
 await client.query("set diceforge.allow_release_restore='yes';");
 await client.query(await sql('restore-before-release.sql'));
 for(const key of Object.keys(before)) check(normalized(await tableRows(key))===normalized(before[key]),'Restoration exact for '+key);
 check(JSON.stringify(await functions())===JSON.stringify(initialFunctions),'Functions and function permissions restored exactly');
 assert.deepEqual(await structure(),initialStructure);
 check(true,'Public/v2 triggers, policies, views, constraints and table permissions restored exactly');
 await fs.writeFile(path.join(out,'rehearsal-report.json'),JSON.stringify({passed:true,checks,project_ref:snapshot.project_ref,captured_at:snapshot.captured_at,production_modified:false},null,2));
 console.log(JSON.stringify({passed:true,checks,production_modified:false}));
} finally {
 if(client) await client.end().catch(()=>{});
 await engine.stop().catch(()=>{});
}
