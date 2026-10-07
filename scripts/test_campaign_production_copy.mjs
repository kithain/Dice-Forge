// Rehearse against an existing private application backup, never a remote database.
// node scripts/test_campaign_production_copy.mjs <runtime> <private-backup-directory>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const [runtime,backup,releaseSql]=process.argv.slice(2);
if(!runtime||!backup)throw Error('Expected PostgreSQL runtime and private backup directory');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {default:EmbeddedPostgres}=await import(pathToFileURL(path.resolve(runtime,'node_modules/embedded-postgres/dist/index.js')));
const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const databaseDir=path.resolve(os.tmpdir(),'diceforge-campaign-copy-'+randomUUID());
const engine=new EmbeddedPostgres({databaseDir,user:'postgres',password:randomUUID(),port,persistent:process.platform==='win32',
  initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1','-c','log_min_error_statement=panic']});
let client;let checks=0;
const check=(value,message)=>{assert(value,message);checks++;};
try{
  await engine.initialise();await engine.start();await engine.createDatabase('campaign_copy');
  client=engine.getPgClient('campaign_copy','127.0.0.1');await client.connect();
  await client.query(await fs.readFile(path.join(backup,'bootstrap-copy.sql'),'utf8'));
  const migrate=async name=>client.query(await fs.readFile(path.join(root,'migrations/character-v2',name),'utf8'));
  await migrate('mj-notebook-sources.sql');await migrate('campaign-sheet-copy.sql');
  const before=(await client.query('select id,character_id,campaign_id,diceforge_v2.sheet(id) sheet,diceforge_v2.inventory(id) inventory from diceforge_v2.states order by id')).rows;
  const mj=(await client.query("select owner_id from public.rooms where room_code='4SSU'")).rows[0].owner_id;
  await client.query("select set_config('request.jwt.claim.sub',$1,false)",[mj]);
  if(releaseSql) await client.query(await fs.readFile(releaseSql,'utf8'));
  else {await migrate('campaign-valombre.sql');await migrate('campaign-management.sql');}
  for(const old of before){
    const current=(await client.query('select character_id,diceforge_v2.sheet(id) sheet,diceforge_v2.inventory(id) inventory from diceforge_v2.states where id=$1',[old.id])).rows[0];
    assert.deepEqual(current.sheet,old.sheet);assert.deepEqual(current.inventory,old.inventory);
    check(current.character_id===old.character_id,'Permanent identity and full historical state remain intact');
  }
  await client.query('begin');
  for(const row of before){
    const owner=(await client.query('select owner_user_id from diceforge_v2.characters where id=$1',[row.character_id])).rows[0].owner_user_id;
    await client.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await client.query('set local role authenticated');
    const sheet=(await client.query("select public.df_character_query('pj_sheets','read',jsonb_build_object('id',$1::text),null,'4SSU') result",[row.id])).rows[0].result.rows[0];
    if(sheet){
      const payload={user_id:owner,character_name:sheet.character_name,expected_revision:sheet.revision,sheet_data:sheet.sheet_data};
      const saved=(await client.query("select public.df_character_query('pj_sheets','upsert',jsonb_build_object('id',$1::text),$2,'4SSU') result",[row.id,payload])).rows[0].result;
      check(saved.rows[0].character_id===row.character_id,'Historical authenticated sheet can still be saved');
    }
    await client.query('reset role');
  }
  await client.query('rollback');
  await client.query('begin');await client.query("select set_config('request.jwt.claim.sub',$1,true)",[mj]);await client.query('set local role authenticated');
  const campaign=(await client.query("select public.df_campaigns('create',null,'Rehearsal only','Synthetic campaign') result")).rows[0].result.campaign.id;
  await client.query("select public.df_create_session_room(null,'NEWC','MJ',$1)",[campaign]);
  const roster=(await client.query("select public.df_character_roster('NEWC','list') result")).rows[0].result;
  check(roster.characters.length===0,'New campaign excludes the same MJ’s older identities');
  const generated=(await client.query("select public.df_generate_character('NEWC','create',null,$1,'{}',gen_random_uuid()) result",[{nom:'Synthetic new PJ',espece:'Humain',profession:'Guerrier',richesse:'Moyen'}])).rows[0].result;
  check(generated.campaign_id===campaign&&generated.state_id,'New PJ receives its selected campaign ID');
  const created=(await client.query("select public.df_character_roster('NEWC','list') result")).rows[0].result;
  check(created.characters.length===1&&created.characters[0].campaign_id===campaign,'Created PJ appears only in the new campaign');
  await client.query('rollback');
  console.log(`PASS production backup rehearsal: ${checks} checks; no remote writes.`);
}finally{
  if(client)await client.end().catch(()=>{});await engine.stop().catch(()=>{});
  assert.equal(path.dirname(databaseDir),path.resolve(os.tmpdir()));assert(path.basename(databaseDir).startsWith('diceforge-campaign-copy-'));
  await fs.rm(databaseDir,{recursive:true,force:true,maxRetries:15,retryDelay:200});
}
