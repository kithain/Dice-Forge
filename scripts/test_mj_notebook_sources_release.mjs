// Read-only notebook mapping on a fresh local production copy; never connects remotely.
// Usage: node scripts/test_mj_notebook_sources_release.mjs <runtime> <private-directory>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const [runtime,directory]=process.argv.slice(2);
if(!runtime||!directory)throw Error('Expected runtime and private snapshot directory');
const out=path.resolve(directory),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const snapshot=JSON.parse(await fs.readFile(path.join(out,'server-before.json'),'utf8'));
const {default:EmbeddedPostgres}=await import(pathToFileURL(path.resolve(runtime,'node_modules/embedded-postgres/dist/index.js')));
const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const engine=new EmbeddedPostgres({databaseDir:path.join(out,'mapping-copy-'+randomUUID()),user:'postgres',password:randomUUID(),port,persistent:process.platform==='win32',initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1','-c','log_min_error_statement=panic']});
let client;let checks=0;
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const rows=async key=>(await client.query('select to_jsonb(r) value from '+key.split('.').map(quote).join('.')+' r')).rows.map(r=>JSON.stringify(r.value)).sort();
try{
 await engine.initialise();await engine.start();await engine.createDatabase('mapping_test');
 client=engine.getPgClient('mapping_test','127.0.0.1');await client.connect();await client.query("set timezone='UTC'");
 await client.query(await fs.readFile(path.join(out,'bootstrap-copy.sql'),'utf8'));
 const before={};for(const key of Object.keys(snapshot.data))before[key]=await rows(key);
 assert.equal((await client.query("select to_regprocedure('public.df_mj_notebook_sources(text)') fn")).rows[0].fn,null);
 const migration=await fs.readFile(path.join(root,'migrations/character-v2/mj-notebook-sources.sql'),'utf8');await client.query(migration);
 const room='4SSU',campaignId=snapshot.data['diceforge_v2.campaign_rooms'].find(r=>r.room_code===room).campaign_id;
 const owner=snapshot.data['diceforge_v2.campaigns'].find(c=>c.id===campaignId).owner_user_id;
 await client.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await client.query('set role authenticated');
 const mapping=(await client.query('select public.df_mj_notebook_sources($1) result',[room])).rows[0].result;
 await client.query('reset role');
 for(const state of snapshot.data['diceforge_v2.states'].filter(s=>s.campaign_id===campaignId)){
  const entry=mapping.find(s=>s.state_id===state.id);assert(entry);assert.equal(entry.character_id,state.character_id);
  assert(entry.legacy_sheet_ids.includes(String(state.source_sheet_id)));checks++;
 }
 for(const key of Object.keys(before)){assert.deepEqual(await rows(key),before[key]);checks++;}
 await client.query(migration);assert.deepEqual((await client.query('select public.df_mj_notebook_sources($1) result',[room])).rows[0].result,mapping);checks++;
 await client.query('drop function public.df_mj_notebook_sources(text)');
 for(const key of Object.keys(before))assert.deepEqual(await rows(key),before[key]);checks++;
 await fs.writeFile(path.join(out,'rehearsal-report.json'),JSON.stringify({passed:true,checks,production_modified:false,legacy_mappings:mapping.length,captured_at:snapshot.captured_at},null,2));
 console.log(JSON.stringify({passed:true,checks,legacy_mappings:mapping.length,production_modified:false}));
}finally{if(client)await client.end().catch(()=>{});await engine.stop().catch(()=>{});}
