import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
export async function runVerbalCloudChecks({client,root,uid,outsider,check}) {
 const migration=await fs.readFile(path.join(root,'supabase-verbal-overlay.sql'),'utf8');await client.query(migration);await client.query(migration);
 const payload={visible:true,draw_id:'a'.repeat(32),new_draw:true,character:'Ilya',approach:'Persuader',words:Array.from({length:6},(_,i)=>({word:'Mot '+i,used:false,discarded:false}))};
 const publish=async(data=payload,room='TEST')=>(await client.query('select public.df_publish_verbal_overlay($1,$2) state',[room,data])).rows[0].state;
 await client.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 await client.query('set role authenticated');
 let state=await publish();check(state.character==='Ilya' && state.revision===1,'Authenticated player publishes cloud draw');
 const changed=structuredClone(payload);changed.new_draw=false;changed.words[0].used=true;changed.words[1].discarded=true;
 state=await publish(changed);check(state.revision===2 && state.words[0].used && state.words[1].discarded,'Word tracking published');
 const second={...payload,draw_id:'b'.repeat(32),character:'Other PJ'};state=await publish(second);
 assert.deepEqual(await publish(changed),state);check(true,'Old draw update cannot replace the latest draw');
 await publish(payload,'DEST');
 check((await client.query("select state->>'character' name from public.obs_verbal_states where room_code='TEST'")).rows[0].name==='Other PJ','Different room independent');
 await client.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider]);
 await assert.rejects(publish(),e=>e.code==='42501');check(true,'Non-member publication rejected');
 await client.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 for(const bad of [{...payload,words:[]},{...payload,draw_id:'bad'},{...payload,words:Array(6).fill(payload.words[0])},{...payload,new_draw:'true'},{...payload,words:payload.words.map(w=>({...w,discarded:true}))}]) {
  await assert.rejects(publish(bad),e=>e.code==='22023');check(true,'Malformed draw rejected');
 }
 await assert.rejects(client.query("update public.obs_verbal_states set state='{}'"),e=>e.code==='42501');check(true,'Direct state writes refused');
 await client.query('reset role');await client.query('set role anon');
 check((await client.query("select state->>'character' name from public.obs_verbal_states where room_code='TEST'")).rows[0].name==='Other PJ','Unauthenticated OBS can read the public draw');
 await assert.rejects(publish(),e=>e.code==='42501');check(true,'Anonymous publication refused');
 await client.query('reset role');
}
