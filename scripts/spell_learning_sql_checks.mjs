import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export async function runLearningChecks({client,engine,root,uid,outsider,rpc,read,write,check,reject}) {
 const upgrade=await fs.readFile(path.join(root,'migrations/character-v2/spell-learning.sql'),'utf8');
 await client.query(upgrade);
 check((await client.query('select bool_and(n between 1 and 6) ok from (select diceforge_v2.roll_d6() n from generate_series(1,1000)) rolls')).rows[0].ok,'Actual server D6 stays in 1..6');
 await client.query("create sequence diceforge_v2.test_die minvalue 3 maxvalue 5 start 3 cycle; create or replace function diceforge_v2.roll_d6() returns integer language sql volatile as $$ select nextval('diceforge_v2.test_die')::integer $$");
 const ids=(await client.query('select id from diceforge_v2.skill_catalog order by id limit 3')).rows.map(r=>r.id);
 await rpc('personnages','insert',{}, {user_id:uid,nom:'Apprentice',player_name:'Player',intelligence:18});
 let row=(await rpc('pj_sheets','upsert',{}, {user_id:uid,character_name:'Apprentice',sheet_data:{fields:{name:'Apprentice',skillProfessionalPool:'0'},stats:{intelligence:18},skills:ids.map(id=>({id,base:0,points:60,score:60,checked:false})),spells:[]}})).rows[0];
 await client.query('select public.df_validate_creation($1,$2,$3)',[row.id,'TEST',row.revision]);row=await read(row.id);
 const learn=async({state=row.id,room='TEST',spell='spell.feu',source='Grimoire du maître',method='text',days=6,confirmed=true,request=randomUUID(),revision=row.revision,connection=client}={})=>(await connection.query(
  'select public.df_learn_spell($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[state,room,spell,source,method,days,confirmed,request,revision])).rows[0].result;
 await reject(learn({confirmed:false}),'22023');await reject(learn({source:''}),'22023');await reject(learn({days:0}),'22023');
 await reject(learn({revision:row.revision-1}),'40001');await reject(learn({spell:'unknown'}),'22023');await reject(learn({room:'DEST'}),'42501');
 await client.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider]);await reject(learn(),'42501');
 await client.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 const request=randomUUID();const acquired=await learn({request});
 check(acquired.receipt.score===32 && JSON.stringify(acquired.receipt.dice)==='[3,4,5]','INT 18 and empty creation budget: exactly 20+3+4+5 = 32');
 const spell=acquired.sheet_data.spells.find(s=>s.id==='spell.feu');
 check(spell.points===32 && spell.allocation.base===0 && spell.allocation.origin==='learning' && spell.allocation.learning_points===32,'All learning points belong exclusively to the new spell');
 check(acquired.sheet_data.progression.learning_points===32 && acquired.sheet_data.progression.xp_points===0 && acquired.sheet_data.progression.session.remaining===9,'Learning neither spends nor refills XP');
 assert.deepEqual(acquired.sheet_data.skills,row.sheet_data.skills);
 const replay=await learn({request});check(replay.sheet_data.revision===acquired.sheet_data.revision && replay.receipt.score===32,'Same acquisition request returns one receipt without reroll');
 await reject(learn({request,spell:'spell.givre'}),'22023');await reject(learn({revision:acquired.sheet_data.revision}),'42501');
 check(Number((await client.query('select last_value n from diceforge_v2.test_die')).rows[0].n)===5,'Duplicate acquisition never rolls new dice');
 row=await read(row.id);
 for(const amount of [0,20,33]) {const forged=structuredClone(row.sheet_data);forged.spells[0].points=amount;await reject(write(row,forged),'42501');}
 const removed=structuredClone(row.sheet_data);removed.spells=[];await reject(write(row,removed),'42501');
 const forged=structuredClone(row.sheet_data);forged.spells.push({id:'spell.givre',name:'Givre',points:32});await reject(write(row,forged),'42501');
 const tampered=structuredClone(row.sheet_data);tampered.progression.learning_points=999;tampered.spells[0].allocation={score:99,base:18};
 row=await write(row,tampered);check(row.sheet_data.spells[0].allocation.score===32 && row.sheet_data.progression.learning_points===32,'Forged learning metadata is overwritten by canonical attribution');
 const marked=structuredClone(row.sheet_data);marked.spells[0].checked=true;marked.fields.notes='Preserved';row=await write(row,marked);
 const xp=async(op,amount,request=randomUUID(),revision=row.revision)=>(await client.query('select public.df_progression($1,$2,$3,$4,$5,$6,$7,$8) result',[row.id,'TEST',op,'spell','spell.feu',amount,request,revision])).rows[0].result;
 await client.query("create or replace function diceforge_v2.roll_d100() returns integer language sql volatile as 'select 80'");
 const unlocked=await xp('unlock',null);check(unlocked.receipt.score===32,'XP unlock compares acquired score, without INT');
 const gain=await xp('spend',2,randomUUID(),unlocked.sheet_data.revision);
 check(gain.sheet_data.spells[0].points===34 && gain.sheet_data.spells[0].allocation.score===32 && gain.sheet_data.spells[0].allocation.xp_points===2 && gain.session.remaining===7,'Later XP raises score to 34 and preserves initial learning roll');
 await client.query('alter table diceforge_v2.states disable trigger df_guard_creation_state');
 await client.query('update diceforge_v2.states set stats=jsonb_set(stats,\'{intelligence}\',\'22\') where id=$1',[row.id]);
 await client.query('alter table diceforge_v2.states enable trigger df_guard_creation_state');
 row=await read(row.id);check(row.sheet_data.spells[0].allocation.score===32 && row.sheet_data.spells[0].allocation.base===0 && row.sheet_data.creation.personal===180,'An administrative INT change never alters the learned baseline or original pool');
 // Two independent connections try the same new acquisition. At most one wins; no second score is granted.
 const second=engine.getPgClient('creation_test','127.0.0.1');await second.connect();
 try {await second.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  const results=await Promise.allSettled([learn({spell:'spell.givre'}),learn({spell:'spell.givre',connection:second})]);
  check(results.filter(r=>r.status==='fulfilled').length===1,'Concurrent acquisition creates exactly one spell');
 }finally {await second.end();}
 row=await read(row.id);
 const another=(await client.query("select id from diceforge_v2.spell_catalog where id not in ('spell.feu','spell.givre') order by id limit 1")).rows[0].id;
 const shared=randomUUID();const third=engine.getPgClient('creation_test','127.0.0.1');await third.connect();
 try {await third.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  const results=await Promise.all([learn({spell:another,request:shared}),learn({spell:another,request:shared,connection:third})]);
  check(results[0].receipt.request_id===shared && results[1].receipt.request_id===shared &&
   Number((await client.query('select count(*) n from diceforge_v2.point_events where request_id=$1',[shared])).rows[0].n)===1,'Concurrent retries of one acquisition return the same single saved roll');
 }finally {await third.end();}
 const prior=(await read(row.id)).sheet_data;await client.query(upgrade);
 assert.deepEqual((await read(row.id)).sheet_data,prior);check(true,'Learning migration is reentrant and preserves every acquisition and gain');
 check(!(await client.query("select has_function_privilege('anon','public.df_learn_spell(uuid,text,text,text,text,integer,boolean,uuid,bigint)','EXECUTE') allowed")).rows[0].allowed,'Anonymous acquisition denied');
 console.log('PASS learned spells: reserved points, 32% at INT18, replay, concurrency, frozen scores, XP, INT independence and unchanged original budget.');
}
