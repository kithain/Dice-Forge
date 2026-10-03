import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export async function runProgressionChecks({client,engine,root,uid,outsider,legacy,capped,draft,review,rpc,read,write,check,reject}) {
 await client.query('alter table public.rooms add column owner_name text; alter table public.room_members add column player_name text');
 const upgrade=await fs.readFile(path.join(root,'migrations/character-v2/progression.sql'),'utf8');
 await client.query(upgrade);
 await client.query('create table public.rolls(room_code text,user_id uuid,player_name text,expression text,rolls_detail text,total integer,is_crit boolean,is_fail boolean,is_hidden boolean)');
 const publication=await fs.readFile(path.join(root,'migrations/character-v2/progression-publication.sql'),'utf8');
 await client.query(publication);
 const act=async(state,room,op,resource=null,id=null,amount=null,request=null,revision=null,connection=client)=>(await connection.query(
  'select public.df_progression($1,$2,$3,$4,$5,$6,$7,$8) result',[state,room,op,resource,id,amount,request,revision])).rows[0].result;
 const createRoom=async(code,source='TEST')=>(await client.query('select public.df_create_session_room($1,$2,$3) result',[source,code,'MJ'])).rows[0].result;
 const scoreResult=(await client.query('select diceforge_v2.unlock_result(65,65) equal, diceforge_v2.unlock_result(65,66) greater, diceforge_v2.unlock_result(100,100) capped')).rows[0];
 check(!scoreResult.equal && scoreResult.greater && !scoreResult.capped,'Strict D100 > score, including cap 100');
 check((await client.query('select bool_and(n between 1 and 100) ok from (select diceforge_v2.roll_d100() n from generate_series(1,1000)) r')).rows[0].ok,'Actual server D100 remains in 1..100');
 await client.query("create or replace function diceforge_v2.roll_d100() returns integer language sql volatile as 'select 80'");
 const startRevision=legacy.revision;
 legacy=await read(legacy.id);
 check(legacy.revision===startRevision+1 && legacy.sheet_data.progression.session.pool===8,'Own sheet opens one ceil(INT/2) pool');
 check(legacy.sheet_data.skills[0].checked && legacy.sheet_data.spells[0].checked,'Initial historical checkboxes preserved');
 const sessionCount=async()=>Number((await client.query('select count(*) n from diceforge_v2.xp_sessions where state_id=$1',[legacy.id])).rows[0].n);
 const replayRead=await read(legacy.id);
 check(replayRead.revision===legacy.revision && await sessionCount()===1,'Reconnection neither resets nor refills');
 await client.query('alter table public.rolls add constraint test_publication_failure check(total<>77)');
 await client.query("create or replace function diceforge_v2.roll_d100() returns integer language sql volatile as 'select 77'");
 await reject(act(legacy.id,'TEST','unlock','skill','skill.estimation',null,randomUUID(),legacy.revision),'23514');
 check(Number((await client.query('select count(*) n from diceforge_v2.xp_attempts')).rows[0].n)===0 && (await read(legacy.id)).revision===legacy.revision,'Publication failure rolls back the attempt and revision');
 await client.query('alter table public.rolls drop constraint test_publication_failure');
 await client.query("create or replace function diceforge_v2.roll_d100() returns integer language sql volatile as 'select 80'");
 await reject(act(review.id,'TEST','open'),'42501');
 await reject(act(legacy.id,'DEST','open'),'42501');
 await client.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider]);
 await reject(act(legacy.id,'TEST','open'),'42501');
 await reject(client.query("insert into public.rooms(room_code,owner_id) values('FAKE',$1)",[outsider]),'42501');
 await reject(createRoom('FAKE'),'42501');
 await reject(client.query("select public.df_link_campaign_room(null,'TEST')"),'42501');
 await client.query('insert into diceforge_v2.mj_users values($1)',[outsider]);
 await reject(createRoom('FAKE'),'42501');
 check(!(await client.query("select exists(select 1 from public.rooms where room_code='FAKE') present")).rows[0].present,'Rejected creation never leaves an orphan room');
 await client.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 const unlocked=await act(legacy.id,'TEST','unlock','skill','skill.estimation',null,randomUUID(),legacy.revision);
 check(unlocked.receipt.roll===80 && unlocked.receipt.score===40 && unlocked.receipt.unlocked,'Unlock uses authoritative score and server roll');
 const same=await act(legacy.id,'TEST','unlock','skill','skill.estimation',null,unlocked.receipt.request_id,legacy.revision);
 check(same.sheet_data.revision===unlocked.sheet_data.revision && same.receipt.roll===80,'Retry does not reroll or require newer revision');
 assert.equal(Number((await client.query('select count(*) n from public.rolls')).rows[0].n),1,'Attempt and room publication are exactly once, including replay');
 await reject(act(legacy.id,'TEST','unlock','skill','skill.estimation',null,randomUUID(),unlocked.sheet_data.revision),'42501');
 await reject(act(legacy.id,'TEST','unlock','spell','spell.feu',null,randomUUID(),legacy.revision),'40001');
 const fire=await act(legacy.id,'TEST','unlock','spell','spell.feu',null,randomUUID(),unlocked.sheet_data.revision);
 check(fire.receipt.score===36 && fire.receipt.unlocked,'Historical spell score is INT plus inherited points');
 await reject(act(legacy.id,'TEST','spend','skill','skill.estimation',-1,randomUUID(),fire.sheet_data.revision),'22023');
 await reject(act(legacy.id,'TEST','spend','skill','skill.estimation',9,randomUUID(),fire.sheet_data.revision),'22023');
 await reject(client.query('select public.df_progression($1,$2,$3,$4,$5,$6,$7,$8)',[legacy.id,'TEST','spend','skill','skill.estimation','1.5',randomUUID(),fire.sheet_data.revision]),'22P02');
 const gain=await act(legacy.id,'TEST','spend','skill','skill.estimation',4,randomUUID(),fire.sheet_data.revision);
 check(gain.session.remaining===4 && gain.sheet_data.skills[0].score===44 && gain.sheet_data.skills[0].allocation.inherited_points===25 && gain.sheet_data.skills[0].allocation.xp_points===4,'Atomic gain, pool reduction, and separate provenance');
 const spendReplay=await act(legacy.id,'TEST','spend','skill','skill.estimation',4,gain.receipt.request_id,fire.sheet_data.revision);
 check(spendReplay.session.remaining===4 && spendReplay.sheet_data.revision===gain.sheet_data.revision,'Repeated spend cannot grant points twice');
 await reject(act(legacy.id,'TEST','spend','skill','skill.estimation',3,gain.receipt.request_id,gain.sheet_data.revision),'22023');
 await reject(act(legacy.id,'TEST','unlock','spell','spell.feu',null,gain.receipt.request_id,gain.sheet_data.revision),'22023');
 const fireGain=await act(legacy.id,'TEST','spend','spell','spell.feu',3,randomUUID(),gain.sheet_data.revision);
 check(fireGain.session.remaining===1 && fireGain.sheet_data.spells[0].points===23 && fireGain.sheet_data.progression.xp_points===7,'One shared pool distributes skill and spell XP');
 legacy=await read(legacy.id);
 const forged=structuredClone(legacy.sheet_data); forged.skills[0].points++; forged.skills[0].score++;
 await reject(write(legacy,forged),'42501');
 const lower=structuredClone(legacy.sheet_data);lower.skills[0].points--;lower.skills[0].score--;
 await reject(write(legacy,lower),'42501');
 const normal=structuredClone(legacy.sheet_data);normal.fields.notes='XP kept on ordinary save';
 legacy=await write(legacy,normal);
 check(legacy.sheet_data.progression.xp_points===7 && legacy.sheet_data.skills[0].score===44,'Ordinary saves preserve server XP');
 await createRoom('NEXT');
 await rpc('personnages','read',{user_id:uid,state_id:legacy.id},null,'NEXT');
 const next=await act(legacy.id,'NEXT','status');
 check(next.session.pool===8 && next.session.remaining===8 && !next.sheet_data.skills[0].checked && !next.sheet_data.spells[0].checked,'New room gets fresh pool and checkboxes');
 const old=await act(legacy.id,'TEST','open');
 check(old.session.closed_at && old.session.lost===1 && old.session.remaining===0 && await sessionCount()===2,'Old remainder forfeited; old room never reopens');
 check(old.session.checks.length===2 && next.session.checks.length===0,'Check history belongs to its own room and is preserved after reset');
 await reject(write(await read(legacy.id),old.sheet_data),'42501');
 await reject(act(legacy.id,'TEST','spend','spell','spell.feu',1,randomUUID(),next.sheet_data.revision),'42501');
 await reject(act(legacy.id,'NEXT','unlock','skill','skill.estimation',null,randomUUID(),next.sheet_data.revision),'42501');
 let active=await read(legacy.id,'NEXT');
 const marked=structuredClone(active.sheet_data);marked.skills[0].checked=true;marked.spells[0].checked=true;
 active=await write(active,marked,'NEXT');
 assert.equal(active.sheet_data.progression.session.checks.length,2,'Ordinary checkbox saves synchronize the current session ledger');
 await client.query("create or replace function diceforge_v2.roll_d100() returns integer language sql volatile as 'select 44'");
 const equal=await act(legacy.id,'NEXT','unlock','skill','skill.estimation',null,randomUUID(),active.revision);
 check(!equal.receipt.unlocked && equal.receipt.score===44,'Equality consumes the attempt without unlocking');
 await reject(act(legacy.id,'NEXT','spend','skill','skill.estimation',1,randomUUID(),equal.sheet_data.revision),'42501');
 await reject(act(legacy.id,'NEXT','unlock','skill','skill.estimation',null,randomUUID(),equal.sheet_data.revision),'42501');
 await client.query("create or replace function diceforge_v2.roll_d100() returns integer language sql volatile as 'select 80'");
 const again=await act(legacy.id,'NEXT','unlock','spell','spell.feu',null,randomUUID(),equal.sheet_data.revision);
 // Independent connections really compete for the same row/pool, not just the JS transport queue.
 const second=engine.getPgClient('creation_test','127.0.0.1');await second.connect();
 try {
  await second.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  const results=await Promise.allSettled([
   act(legacy.id,'NEXT','spend','spell','spell.feu',5,randomUUID(),again.sheet_data.revision),
   act(legacy.id,'NEXT','spend','spell','spell.feu',5,randomUUID(),again.sheet_data.revision,second)]);
  check(results.filter(r=>r.status==='fulfilled').length===1 && results.some(r=>r.status==='rejected' && r.reason.code==='40001'),'Concurrent spends serialize and stale revision rejects the second');
 } finally {await second.end();}
 const afterRace=await read(legacy.id,'NEXT');
 check(afterRace.sheet_data.progression.session.remaining===3 && afterRace.sheet_data.progression.xp_points===12,'Race cannot overspend or duplicate events');
 await reject(act(legacy.id,'NEXT','close',null,null,null,null,afterRace.revision-1),'40001');
 const closed=await act(legacy.id,'NEXT','close',null,null,null,null,afterRace.revision);
 check(closed.session.lost===3 && closed.session.remaining===0,'Explicit closure forfeits only unspent balance');
 check((await act(legacy.id,'NEXT','open')).sheet_data.revision===closed.sheet_data.revision,'Closed session cannot be refilled');
 capped=await read(capped.id);const capData=structuredClone(capped.sheet_data);capData.skills[0].checked=true;capped=await write(capped,capData);
 await reject(act(capped.id,'TEST','unlock','skill','skill.estimation',null,randomUUID(),capped.revision),'42501');
 // New creations are validated and opened together; the returned revision remains usable for a save.
 await rpc('personnages','insert',{}, {user_id:uid,nom:'Session draft',player_name:'Player',intelligence:17});
 const newDraft=(await rpc('pj_sheets','upsert',{}, {user_id:uid,character_name:'Session draft',sheet_data:{
  fields:{name:'Session draft',profession:'Sorcier',race:'Humain',skillProfessionalPool:'325'},stats:{intelligence:17},
  skills:[{id:'skill.estimation',base:15,points:84,score:99,checked:true}],spells:[]}})).rows[0];
 await reject(act(newDraft.id,'TEST','open'),'42501');
 const validated=(await client.query('select public.df_validate_creation($1,$2,$3) result',[newDraft.id,'TEST',newDraft.revision])).rows[0].result;
 check(validated.sheet_data.progression.session.pool===9,'Odd INT rounds up; creation opens session in the same transaction');
 const ready=await read(newDraft.id);
 check(ready.revision===validated.sheet_data.revision && (await write(ready,ready.sheet_data)).sheet_data.progression.session.remaining===9,'First save after validation does not create a stale revision');
 await client.query("create or replace function diceforge_v2.roll_d100() returns integer language sql volatile as 'select 100'");
 const nearCap=await read(newDraft.id);
 const capUnlock=await act(newDraft.id,'TEST','unlock','skill','skill.estimation',null,randomUUID(),nearCap.revision);
 await reject(act(newDraft.id,'TEST','spend','skill','skill.estimation',2,randomUUID(),capUnlock.sheet_data.revision),'22023');
 const finalCap=await act(newDraft.id,'TEST','spend','skill','skill.estimation',1,randomUUID(),capUnlock.sheet_data.revision);
 check(finalCap.sheet_data.skills[0].score===100 && finalCap.session.remaining===8,'Exactly 100 is allowed, surplus remains in common pool');
 await client.query('update diceforge_v2.characters set owner_user_id=$1 where id=$2',[outsider,finalCap.sheet_data.character_id]);
 const mjView=await read(newDraft.id,'NEXT');
 check(mjView.sheet_data.progression.session===null && Number((await client.query('select count(*) n from diceforge_v2.xp_sessions where state_id=$1',[newDraft.id])).rows[0].n)===1,'MJ viewing another player cannot open or close that player session');
 // Role grants, private helpers and ledgers are inaccessible even through the old RPC identity.
 for(const signature of ['diceforge_v2.character_query_base(text,text,jsonb,jsonb,text)','diceforge_v2.link_campaign_room_base(text,text)','diceforge_v2.validate_creation_base(uuid,text,bigint)','diceforge_v2.session_open(uuid,text)','diceforge_v2.roll_d100()'])
  check(!(await client.query('select has_function_privilege($1,$2,$3) allowed',['authenticated',signature,'EXECUTE'])).rows[0].allowed,'Private progression helper cannot be called');
 for(const table of ['xp_sessions','xp_attempts','mj_users'])
  check(!(await client.query('select has_table_privilege($1,$2,$3) allowed',['authenticated',`diceforge_v2.${table}`,'INSERT'])).rows[0].allowed,'No direct ledger or MJ-role writes');
 const prior=(await read(legacy.id,'NEXT')).sheet_data;
 await client.query(upgrade);
 const published=Number((await client.query('select count(*) n from public.rolls')).rows[0].n);
 await client.query(publication);
 assert.equal(Number((await client.query('select count(*) n from public.rolls')).rows[0].n),published,'Migration replay does not publish old attempts');
 assert.deepEqual((await read(legacy.id,'NEXT')).sheet_data,prior);check(true,'Repeated migration preserves closed session, XP and attempts');
 // Real random function is restored by the migration; no test-only roll exists in the shipping SQL.
 console.log('PASS per-room XP, spell/skill allocation, MJ restriction, closure, replay and concurrent writes.');
}
