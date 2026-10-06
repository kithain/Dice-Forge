import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export async function runCampaignCopyChecks({client,root,uid,outsider,check}) {
 await client.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 // Include the guards that made a newly validated creation different from an inherited sheet.
 await client.query(await fs.readFile(path.join(root,'migrations/character-v2/complete-creation-budget.sql'),'utf8'));
 const migration=await fs.readFile(path.join(root,'migrations/character-v2/campaign-sheet-copy.sql'),'utf8');
 await client.query(migration);await client.query(migration);
 const character=randomUUID(),source=randomUUID();
 await client.query("select set_config('diceforge_v2.generating','trusted',false)");
 await client.query(`insert into diceforge_v2.characters(id,owner_user_id,name,source_player_name,status,initial_record)
  values($1,$2,'Campaign copy fixture','Player','active','{"nom":"Campaign copy fixture","intelligence":17}');`,[character,uid]);
 await client.query("select set_config('diceforge_v2.generating','',false)");
 await client.query(`insert into diceforge_v2.states(id,campaign_id,character_id,fields,stats,legacy_sheet_data,legacy_markdown)
  select $1,campaign_id,$2,'{"name":"Campaign copy fixture","profession":"Sorcier","race":"Humain","skillProfessionalPool":"343","age":"239","genre":"Féminin","notes":"Preserve history"}',
  '{"intelligence":17,"force":12}','{"weapons":[{"name":"Bâton","damage":"1d6"}]}','Fixture markdown'
  from diceforge_v2.campaign_rooms where room_code='TEST';`,[source,character]);
 await client.query(`insert into diceforge_v2.skills(id,state_id,skill_id,base,points,score,checked,legacy_index,raw_payload)
  select gen_random_uuid(),$1,'skill.alchimie',1,70,71,false,legacy_index,'{}' from diceforge_v2.skill_catalog where id='skill.alchimie';`,[source]);
 await client.query(`insert into diceforge_v2.spells(id,state_id,spell_id,points,checked,legacy_index,raw_payload) values(gen_random_uuid(),$1,'spell.feu',5,false,0,'{}');`,[source]);
 await client.query("select diceforge_v2.capture_initial_allocations($1,'inherited')",[source]);
 await client.query("update diceforge_v2.creation_states set phase='legacy_review',origin='inherited',professional_pool=343,personal_pool=170 where state_id=$1",[source]);
 await client.query("update diceforge_v2.creation_states set phase='play' where state_id=$1",[source]);
 await client.query("insert into diceforge_v2.point_events(state_id,kind,resource,resource_id,amount,actor_user_id) values($1,'xp','skill','skill.alchimie',20,$2)",[source,uid]);
 await client.query("update diceforge_v2.skills set points=90,score=91 where state_id=$1 and skill_id='skill.alchimie'",[source]);
 await client.query("select set_config('diceforge_v2.marking_check','trusted_roll',false)");
 await client.query('update diceforge_v2.skills set checked=true where state_id=$1',[source]);
 await client.query('update diceforge_v2.spells set checked=true where state_id=$1',[source]);
 await client.query("select set_config('diceforge_v2.marking_check','',false)");
 const original=(await client.query('select diceforge_v2.sheet($1) sheet',[source])).rows[0].sheet;
 const attach=async()=>client.query("select public.df_character_roster('DEST','attach',$1,null)",[character]);
 await client.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider]);
 await assert.rejects(attach(),e=>e.code==='42501');check(true,'Other users cannot copy a character');
 await client.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 await attach();
 const target=(await client.query("select s.id,diceforge_v2.sheet(s.id) sheet from diceforge_v2.states s join diceforge_v2.campaign_rooms r on r.campaign_id=s.campaign_id where r.room_code='DEST' and s.character_id=$1",[character])).rows[0];
 assert.deepEqual(target.sheet.fields,original.fields);assert.deepEqual(target.sheet.stats,original.stats);
 const alchemy=target.sheet.skills.find(s=>s.id==='skill.alchimie');
 check(!alchemy.checked && !target.sheet.spells.find(s=>s.id==='spell.feu').checked,'Pending successful-roll checks stay in their original campaign');
 check(alchemy.score===91 && alchemy.points===90 && alchemy.allocation.inherited_points===90 && alchemy.allocation.xp_points===0,'Current skill scores including acquired XP become the destination baseline');
 check(target.sheet.spells.find(s=>s.id==='spell.feu').points===5,'Spell scores copied');
 assert.deepEqual(target.sheet.weapons,original.weapons);
 check(target.sheet.creation.phase==='play' && target.sheet.creation.professional===343,'Inherited creation remains locked with original professional pool');
 check(target.sheet.state_id!==source && target.sheet.character_id===character,'Campaign identity distinct, permanent character retained');
 check(Number((await client.query('select count(*) n from diceforge_v2.xp_sessions where state_id=$1',[target.id])).rows[0].n)===0,'Source XP sessions not copied');
 check(Number((await client.query("select count(*) n from diceforge_v2.point_events where state_id=$1 and kind='xp'",[target.id])).rows[0].n)===0,'XP ledger not duplicated');
 await client.query("update diceforge_v2.states set fields=jsonb_set(fields,'{notes}','\"Destination only\"') where id=$1",[target.id]);
 await attach();
 check((await client.query("select fields->>'notes' notes from diceforge_v2.states where id=$1",[target.id])).rows[0].notes==='Destination only','Repeated attach preserves existing destination sheet');
 assert.deepEqual((await client.query('select diceforge_v2.sheet($1) sheet',[source])).rows[0].sheet,original);
 check(true,'Source state and revision unchanged by copy');
 await assert.rejects(client.query('select diceforge_v2.inherit_sheet_snapshot($1,$2)',[source,target.id]),e=>e.code==='22023');
 check(true,'Populated destination cannot be overwritten by the snapshot helper');
 // Exercise repairing a pre-fix empty target whose generator pool was reset to 325.
 await client.query("insert into public.rooms values('FIX1',$1)",[uid]);
 await client.query("select public.df_link_campaign_room(null,'FIX1')");
 const blank=randomUUID();
 await client.query(`insert into diceforge_v2.states(id,campaign_id,character_id,fields,stats,legacy_sheet_data,legacy_markdown)
  select $1,campaign_id,$2,'{"name":"Campaign copy fixture","profession":"Sorcier","race":"Humain","skillProfessionalPool":"325"}',
  '{"intelligence":17,"force":12}','{}','' from diceforge_v2.campaign_rooms where room_code='FIX1'`,[blank,character]);
 await client.query('begin');
 await client.query('alter table diceforge_v2.states disable trigger df_professional_pool');
 await client.query('select diceforge_v2.inherit_sheet_snapshot($1,$2)',[source,blank]);
 await client.query('set constraints all immediate');
 await client.query('alter table diceforge_v2.states enable trigger df_professional_pool');
 await client.query('commit');
 check((await client.query('select diceforge_v2.sheet($1) sheet',[blank])).rows[0].sheet.fields.skillProfessionalPool==='343','Pre-fix empty sheet repaired with pool and guards restored');
 const draftCharacter=randomUUID(),draftSource=randomUUID();
 await client.query("select set_config('diceforge_v2.generating','trusted',false)");
 await client.query(`insert into diceforge_v2.characters(id,owner_user_id,name,source_player_name,status,initial_record)
  values($1,$2,'Draft copy fixture','Player','active','{"nom":"Draft copy fixture","intelligence":17,"profession":"Sorcier"}')`,[draftCharacter,uid]);
 await client.query("select set_config('diceforge_v2.generating','',false)");
 await client.query(`insert into diceforge_v2.states(id,campaign_id,character_id,fields,stats,legacy_sheet_data,legacy_markdown)
  select $1,campaign_id,$2,'{"name":"Draft copy fixture","profession":"Sorcier","skillProfessionalPool":"325"}','{"intelligence":17}','{}',''
  from diceforge_v2.campaign_rooms where room_code='TEST'`,[draftSource,draftCharacter]);
 // With no allocated sheet yet, keep the original generator-only fallback.
 await client.query("select public.df_character_roster('DEST','attach',$1,null)",[draftCharacter]);
 check((await client.query(`select c.phase,(select count(*) from diceforge_v2.skills where state_id=s.id) skills
  from diceforge_v2.states s join diceforge_v2.creation_states c on c.state_id=s.id join diceforge_v2.campaign_rooms r on r.campaign_id=s.campaign_id
  where s.character_id=$1 and r.room_code='DEST'`,[draftCharacter])).rows[0].phase==='draft','Generated character without scores still starts as a draft');
 // A separate destination exercises copying a partially allocated draft.
 await client.query("insert into public.rooms values('DRFT',$1)",[uid]);
 await client.query("insert into public.room_members values('DRFT',$1)",[uid]);
 await client.query("select public.df_link_campaign_room(null,'DRFT')");
 await client.query(`insert into diceforge_v2.skills(id,state_id,skill_id,base,points,score,checked,legacy_index,raw_payload)
  select gen_random_uuid(),$1,'skill.alchimie',1,10,11,false,legacy_index,'{}' from diceforge_v2.skill_catalog where id='skill.alchimie'`,[draftSource]);
 await client.query("select public.df_character_roster('DRFT','attach',$1,null)",[draftCharacter]);
 const draft=(await client.query(`select diceforge_v2.sheet(s.id) sheet from diceforge_v2.states s join diceforge_v2.campaign_rooms r on r.campaign_id=s.campaign_id
  where s.character_id=$1 and r.room_code='DRFT'`,[draftCharacter])).rows[0].sheet;
 check(draft.creation.phase==='draft' && draft.skills.find(s=>s.id==='skill.alchimie').score===11,'Partial draft copied without validating or locking it');
 check(!(await client.query("select has_function_privilege('authenticated','diceforge_v2.inherit_sheet_snapshot(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,'Snapshot helper inaccessible to clients');
}
