import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function runDeletionChecks({client,engine,root,uid,outsider,rpc,read,check,reject}) {
 const migration=await fs.readFile(path.join(root,'migrations/character-v2/character-deletion.sql'),'utf8');
 const pristine=(await client.query('select id,diceforge_v2.sheet(id) sheet,diceforge_v2.inventory(id) inventory from diceforge_v2.states order by id')).rows;
 await client.query(migration);
 assert.deepEqual((await client.query('select id,diceforge_v2.sheet(id) sheet,diceforge_v2.inventory(id) inventory from diceforge_v2.states order by id')).rows,pristine);
 check(true,'Installing deletion preserves every existing sheet and inventory');
 await client.query(await fs.readFile(path.join(root,'migrations/character-v2/mj-notebook-sources.sql'),'utf8'));
 const setUser=id=>client.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 const roster=(op='list',id=null,room='TEST')=>client.query('select public.df_character_roster($1,$2,$3) result',[room,op,id]).then(r=>r.rows[0].result);
 const saved=async id=>(await client.query(`select jsonb_build_object(
  'states',(select jsonb_agg(to_jsonb(s) order by s.id) from diceforge_v2.states s where character_id=$1),
  'skills',(select jsonb_agg(to_jsonb(k) order by k.id) from diceforge_v2.skills k join diceforge_v2.states s on s.id=k.state_id where s.character_id=$1),
  'spells',(select jsonb_agg(to_jsonb(k) order by k.id) from diceforge_v2.spells k join diceforge_v2.states s on s.id=k.state_id where s.character_id=$1),
  'items',(select jsonb_agg(to_jsonb(k) order by k.id) from diceforge_v2.items k join diceforge_v2.states s on s.id=k.state_id where s.character_id=$1),
  'wallets',(select jsonb_agg(to_jsonb(k) order by k.state_id) from diceforge_v2.wallets k join diceforge_v2.states s on s.id=k.state_id where s.character_id=$1),
  'creation',(select jsonb_agg(to_jsonb(k) order by k.state_id) from diceforge_v2.creation_states k join diceforge_v2.states s on s.id=k.state_id where s.character_id=$1),
  'xp',(select jsonb_agg(to_jsonb(k) order by k.state_id,k.room_code) from diceforge_v2.xp_sessions k join diceforge_v2.states s on s.id=k.state_id where s.character_id=$1),
  'events',(select jsonb_agg(to_jsonb(k) order by k.id) from diceforge_v2.point_events k join diceforge_v2.states s on s.id=k.state_id where s.character_id=$1)
 ) data`,[id])).rows[0].data;
 const generated=async name=>{
  await setUser(uid);
  await roster('new');
  const request=randomUUID(),details={nom:name,espece:'Humain',profession:'Guerrier',richesse:'Moyen'};
  const result=(await client.query("select public.df_generate_character('TEST','create',null,$1,'{}',$2) result",[details,request])).rows[0].result;
  return {...result,request,details};
 };
 await setUser(outsider);
 const target=(await client.query("select s.id,c.id character_id from diceforge_v2.states s join diceforge_v2.characters c on c.id=s.character_id join diceforge_v2.creation_states cr on cr.state_id=s.id join diceforge_v2.campaign_rooms r on r.campaign_id=s.campaign_id where r.room_code='TEST' and c.owner_user_id=$1 and c.status='active' and cr.phase='play' limit 1",[outsider])).rows[0];
 assert(target,'Expected an existing played player fixture');
 await reject(client.query("select public.df_mj_notebook_sources('TEST')"),'42501');
 await setUser(uid);
 const priorSource=(await client.query('select source_sheet_id from diceforge_v2.states where id=$1',[target.id])).rows[0].source_sheet_id;
 await client.query('update diceforge_v2.states set source_sheet_id=987654 where id=$1',[target.id]);
 await client.query("insert into diceforge_v2.archives(id,source_table,source_key,sha256,payload) values($1,'pj_sheets','987654','test',jsonb_build_object('room_code','TEST','user_id',$2::text,'character_name','Identité historique')),($3,'pj_sheets','987655','test',jsonb_build_object('room_code','DEST','user_id',$2::text,'character_name','Identité historique')),($4,'pj_sheets','987656','test',jsonb_build_object('room_code','TEST','user_id',$2::text,'character_name','Homonyme distinct'))",[randomUUID(),outsider,randomUUID(),randomUUID()]);
 const sources=async room=>(await client.query('select public.df_mj_notebook_sources($1) result',[room])).rows[0].result;
 const mapped=(await sources('TEST')).find(s=>s.state_id===target.id);
 check(mapped.character_id===target.character_id&&JSON.stringify(mapped.legacy_sheet_ids)==='["987654"]','MJ receives the exact legacy-to-permanent mapping for this room');
 await reject(sources('UNKNOWN'),'42501');
 await client.query('update diceforge_v2.states set source_sheet_id=$1 where id=$2',[priorSource,target.id]);
 check(!(await client.query("select has_function_privilege('anon','public.df_mj_notebook_sources(text)','EXECUTE') allowed")).rows[0].allowed,'Anonymous notebook mapping denied');
 await setUser(outsider);
 await roster('select',target.character_id);
 let row=await read(target.id);
 const inv=(await rpc('pj_inventory','read',{id:target.id},null)).rows[0];
 await rpc('pj_inventory','upsert',{id:target.id},{user_id:outsider,expected_revision:inv.revision,po:7,pa:8,pc:9,equipment:[{id:randomUUID(),name:'Sac conservé',description:'Note détaillée'}],weapons:[],armors:[],consumables:[],miscellaneous:[],potions:[]});
 const before=await saved(target.character_id);
 await reject(roster('delete',target.character_id),'42501');
 await reject(roster('restore',target.character_id),'42501');
 check((await roster()).deleted_characters.length===0,'Player cannot inspect the GM trash');
 await setUser(uid);
 check((await roster()).characters.find(c=>c.character_id===target.character_id).can_delete,'Campaign GM can delete a player-owned character');
 await roster('delete',target.character_id);
 const list=await roster();
 check(!list.characters.some(c=>c.character_id===target.character_id) && list.deleted_characters.some(c=>c.character_id===target.character_id && c.can_restore),'Deleted PJ disappears from regular GM list and enters trash');
 check((await sources('TEST')).some(s=>s.state_id===target.id),'MJ can identify and hide legacy notes for a deleted character');
 assert.deepEqual(await saved(target.character_id),before);check(true,'Deletion preserves scores, checks, notes, items, money and all XP history');
 check(Number((await client.query('select count(*) n from diceforge_v2.character_selections where character_id=$1',[target.character_id])).rows[0].n)===0,'Deleted character cleared from every selection');
 check((await rpc('pj_sheets','read',{id:target.id},null)).rows.length===0,'Even GM cannot read a deleted sheet through its UUID');
 check((await rpc('pj_inventory','read',{id:target.id},null)).rows.length===0,'Deleted inventory is inaccessible through the API');
 await setUser(outsider);
 check(!(await roster()).characters.some(c=>c.character_id===target.character_id),'Deleted PJ absent from player list');
 check((await rpc('pj_sheets','read',{id:target.id},null)).rows.length===0,'Owner cannot read the deleted sheet');
 await reject(roster('select',target.character_id),'42501');
 await reject(roster('attach',target.character_id),'42501');
 await reject(rpc('pj_sheets','upsert',{id:target.id},{user_id:outsider,character_name:row.character_name,sheet_data:row.sheet_data,expected_revision:row.revision}),'42501');
 await reject(rpc('pj_inventory','upsert',{id:target.id},{user_id:outsider,expected_revision:inv.revision,po:1000}),'42501');
 await reject(client.query("select public.df_progression($1,'TEST','open')",[target.id]),'42501');
 await reject(client.query("select public.df_validate_creation($1,'TEST',$2)",[target.id,row.revision]),'42501');
 await reject(client.query("select public.df_roll_skill_test($1,'TEST','skill','skill.bagarre','normal',0,$2)",[target.id,randomUUID()]),'42501');
 await setUser(uid);
 await roster('delete',target.character_id);
 check(Number((await client.query("select count(*) n from diceforge_v2.character_lifecycle_events where character_id=$1 and action='delete'",[target.character_id])).rows[0].n)===1,'Repeated deletion records exactly one event');
 await roster('restore',target.character_id);await roster('restore',target.character_id);
 assert.deepEqual(await saved(target.character_id),before);check(true,'Restoration retains the exact original values and XP balance');
 check(!(await roster()).deleted_characters.some(c=>c.character_id===target.character_id),'Restored PJ leaves trash');
 check(Number((await client.query("select count(*) n from diceforge_v2.character_lifecycle_events where character_id=$1 and action='restore'",[target.character_id])).rows[0].n)===1,'Repeated restoration records exactly one event');
 await setUser(outsider);
 check((await roster()).selected_character_id!==target.character_id,'Restoration does not overwrite a newer player selection');
 await roster('select',target.character_id);check((await read(target.id)).character_id===target.character_id,'Player can explicitly reselect restored PJ');

 const first=await generated('Homonyme suppression'),second=await generated('Homonyme suppression');
 await roster('delete',first.character_id);
 check((await roster()).characters.some(c=>c.character_id===second.character_id),'Same-name character untouched by UUID-based deletion');
 await reject(client.query("select public.df_generate_character('TEST','create',null,$1,'{}',$2)",[first.details,first.request]),'42501');
 await reject(client.query("select public.df_generate_character('TEST','save',$1,'{}','{}',$2)",[first.character_id,randomUUID()]),'42501');
 await roster('restore',first.character_id);
 await roster('dead',first.character_id);
 const deadBefore=await saved(first.character_id);
 await roster('delete',first.character_id);await roster('restore',first.character_id);
 check((await roster()).characters.find(c=>c.character_id===first.character_id).status==='dead','Restoring a deleted dead PJ cannot revive it');
 assert.deepEqual(await saved(first.character_id),deadBefore);check(true,'Death history and lost XP remain unchanged after restore');

 const orphan=randomUUID();
 await client.query("select set_config('diceforge_v2.generating','trusted',false)");
 await client.query("insert into diceforge_v2.characters(id,owner_user_id,name,source_player_name,status,initial_record) values($1,$2,'Sans fiche','MJ','active','{}')",[orphan,uid]);
 await client.query("select set_config('diceforge_v2.generating','',false)");
 await roster('delete',orphan);check((await roster()).deleted_characters.some(c=>c.character_id===orphan),'Generated character without sheet can be deleted');
 await roster('restore',orphan);check((await roster()).characters.find(c=>c.character_id===orphan).needs_sheet,'Restoration of an orphan does not invent a sheet');

 const shared=await generated('Autre campagne');
 const otherCampaign=(await client.query("select campaign_id from diceforge_v2.campaign_rooms where room_code='DEST'")).rows[0].campaign_id;
 await client.query("insert into diceforge_v2.states(id,campaign_id,character_id,fields,stats,legacy_sheet_data,legacy_markdown) select $1,$2,character_id,fields,stats,legacy_sheet_data,legacy_markdown from diceforge_v2.states where character_id=$3 limit 1",[randomUUID(),otherCampaign,shared.character_id]);
 await roster('delete',shared.character_id);await roster('restore',shared.character_id);
 check(true,'One GM may remove and restore a PJ shared by campaigns they all manage');
 await client.query('update diceforge_v2.campaigns set owner_user_id=$1 where id=$2',[outsider,otherCampaign]);
 check(!(await roster()).characters.find(c=>c.character_id===shared.character_id).can_delete,'Delete disabled when another GM owns a linked campaign');
 await reject(roster('delete',shared.character_id),'42501');
 await reject(roster('delete',shared.character_id,'DEST'),'42501');
 await client.query('update diceforge_v2.campaigns set owner_user_id=$1 where id=$2',[uid,otherCampaign]);

 const concurrent=await generated('Double suppression');
 const other=engine.getPgClient('creation_test','127.0.0.1');await other.connect();
 try {
  await other.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  await Promise.all([roster('delete',concurrent.character_id),other.query("select public.df_character_roster('TEST','delete',$1)",[concurrent.character_id])]);
  check(Number((await client.query("select count(*) n from diceforge_v2.character_lifecycle_events where character_id=$1 and action='delete'",[concurrent.character_id])).rows[0].n)===1,'Concurrent double deletion is idempotent');
 } finally {await other.end();}
 await roster('restore',concurrent.character_id);
 const prior=await saved(concurrent.character_id);
 await roster('delete',concurrent.character_id);await client.query(migration);
 check((await roster()).deleted_characters.some(c=>c.character_id===concurrent.character_id),'Reapplying migration preserves trash');
 await roster('restore',concurrent.character_id);assert.deepEqual(await saved(concurrent.character_id),prior);check(true,'Reapplication preserves restoration data');
 for(const signature of ['public.df_character_roster(text,text,uuid,uuid)','public.df_generate_character(text,text,uuid,jsonb,jsonb,uuid)'])
  check(!(await client.query("select has_function_privilege('anon',$1,'execute') allowed",[signature])).rows[0].allowed,'Anonymous deletion/generator access refused');
 check(!(await client.query("select has_table_privilege('authenticated','diceforge_v2.character_deletions','UPDATE') allowed")).rows[0].allowed,'Direct trash changes denied');
 check(!(await client.query("select has_function_privilege('authenticated','diceforge_v2.character_roster_before_deletion(text,text,uuid,uuid)','execute') allowed")).rows[0].allowed,'Original roster cannot bypass deletion protection');
 await reject(client.query("update diceforge_v2.character_lifecycle_events set payload='{}' where character_id=$1",[target.character_id]),'42501');
 await setUser(uid);
}
