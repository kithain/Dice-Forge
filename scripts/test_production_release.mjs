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
try {
 await engine.initialise(); await engine.start(); await engine.createDatabase('release_copy');
 client=engine.getPgClient('release_copy','127.0.0.1'); await client.connect();
 await client.query("set timezone='UTC';");
 await client.query(await sql('bootstrap-copy.sql'));
 const initialFunctions=await functions();
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
 await assert.rejects(client.query(await sql('restore-before-release.sql')),e=>e.message.includes('non armée'));
 await client.query('rollback;');
 check(true,'Restoration refused without explicit arming');
 await client.query("set diceforge.allow_release_restore='yes';");
 await client.query(await sql('restore-before-release.sql'));
 for(const key of Object.keys(before)) check(normalized(await tableRows(key))===normalized(before[key]),'Restoration exact for '+key);
 check(JSON.stringify(await functions())===JSON.stringify(initialFunctions),'Functions and function permissions restored exactly');
 await fs.writeFile(path.join(out,'rehearsal-report.json'),JSON.stringify({passed:true,checks,project_ref:snapshot.project_ref,captured_at:snapshot.captured_at,production_modified:false},null,2));
 console.log(JSON.stringify({passed:true,checks,production_modified:false}));
} finally {
 if(client) await client.end().catch(()=>{});
 await engine.stop().catch(()=>{});
}
