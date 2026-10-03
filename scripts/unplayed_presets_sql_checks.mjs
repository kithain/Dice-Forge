import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runUnplayedPresetChecks({client,root,uid,outsider,read,write,check,reject}) {
 const upgrade=await fs.readFile(path.join(root,'migrations/character-v2/unplayed-presets.sql'),'utf8');
 const snapshot=async()=>(await client.query('select id,diceforge_v2.sheet(id) sheet from diceforge_v2.states order by id')).rows;
 const before=await snapshot();await client.query(upgrade);assert.deepEqual(await snapshot(),before);check(true,'Preset upgrade preserves all existing sheets');
 const user=async id=>client.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 const roster=async(op,id,reserved=null)=>(await client.query("select public.df_character_roster('TEST',$1,$2,$3) result",[op,id,reserved])).rows[0].result;
 async function create(name) {
  await user(uid);await roster('new',null);
  const generated=(await client.query("select public.df_generate_character('TEST','create',null,$1,$2,$3) result",[{nom:name,espece:'Humain',profession:'Guerrier',richesse:'Moyen'},{},randomUUID()])).rows[0].result;
  let row=await read(generated.state_id);const personal=Number(row.sheet_data.stats.intelligence)*10;
  const ids=['skill.bagarre','skill.defense','skill.lutte','skill.arme_de_melee','skill.estimation','skill.medecine','skill.alchimie'];
  const points=[100,100,100,25,Math.min(100,personal),Math.max(0,Math.min(100,personal-100)),Math.max(0,personal-200)];
  row=await write(row,{...row.sheet_data,skills:ids.map((id,i)=>({id,base:0,points:points[i],score:points[i],checked:false})),spells:[]});
  await client.query("select public.df_validate_creation($1,'TEST',$2)",[row.id,row.revision]);return read(row.id);
 }
 const untouched=await create('Untouched validated preset');const pool=untouched.sheet_data.progression.session;
 check(pool.spent===0 && pool.closed_at===null,'Validated MJ character has only an unused automatic pool');
 await roster('preset',untouched.character_id,outsider);await user(outsider);
 check((await roster('list',null)).characters.some(c=>c.character_id===untouched.character_id && c.can_select),'Reserved validated preset selectable by intended player');
 await roster('select',untouched.character_id);const claimed=await read(untouched.id);
 assert.deepEqual(claimed.sheet_data.stats,untouched.sheet_data.stats);assert.deepEqual(claimed.sheet_data.skills,untouched.sheet_data.skills);assert.deepEqual(claimed.sheet_data.progression.session,pool);
 check(true,'Claim preserves scores, permanent state and exact existing pool without refill');
 const used=await create('Played preset refused');
 await client.query("select public.df_roll_skill_test($1,'TEST','skill','skill.estimation','normal',0,$2)",[used.id,randomUUID()]);
 await reject(roster('preset',used.character_id),'42501');check((await read(used.id)).sheet_data.progression.session.spent===0,'A game roll blocks preset even without XP spending');
 const attempted=await create('Attempted preset refused');
 await client.query("insert into diceforge_v2.xp_attempts(state_id,room_code,resource,resource_id,roll,score,unlocked,request_id) values($1,'TEST','skill','skill.estimation',1,100,false,$2)",[attempted.id,randomUUID()]);
 await reject(roster('preset',attempted.character_id),'42501');
 const spent=await create('Spent preset refused');await client.query('update diceforge_v2.xp_sessions set spent=1 where state_id=$1',[spent.id]);await reject(roster('preset',spent.character_id),'42501');
 const closed=await create('Closed preset refused');await client.query('update diceforge_v2.xp_sessions set closed_at=clock_timestamp() where state_id=$1',[closed.id]);await reject(roster('preset',closed.character_id),'42501');
 const latest=await snapshot();await client.query(upgrade);assert.deepEqual(await snapshot(),latest);check(true,'Preset upgrade is repeatable and preserves ownership and history');
 check(!(await client.query("select has_function_privilege('authenticated','diceforge_v2.preset_has_game_activity(uuid)','EXECUTE') allowed")).rows[0].allowed,'Private activity check exposes no new player permissions');
}
