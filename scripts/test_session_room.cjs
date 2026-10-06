const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../js/supabase-room.js'),'utf8')
 .replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
function setup(userId='mj') {
 const elements = new Map();
 const element = id => {
  if (!elements.has(id)) elements.set(id,{style:{},value:'',textContent:'',innerHTML:'',children:[]});
  return elements.get(id);
 };
 element('player-name').value='Meneur';element('room-code').value='4SSU';
 const saved=new Map(),calls=[],toasts=[];
 const control={fail:false};
 const sb={auth:{getUser:async()=>({data:{user:{id:userId}},error:null})},
  from(table) {
   const query={columns:'',select(columns){this.columns=columns;return this;},eq(){return this;},neq(){return this;},order(){return this;},
    insert:async()=>({error:null}),upsert:async()=>({error:null}),
    limit(){return Promise.resolve({data:table==='rooms'?[{room_code:'4SSU',owner_id:'mj'}]:[],error:null});}};
   return query;
  },
  rpc:async(name,args)=>{calls.push({name,args});return control.fail?{error:{message:'Refus synthétique'},data:null}:{error:null,data:{campaign_id:'same-campaign'}};},
  channel(){const channel={on(){return this;},subscribe(){return this;},unsubscribe(){}};return channel;}
 };
 const context=vm.createContext({document:{getElementById:element},
  localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)},
  window:{SUPABASE_CONFIG:{characterV2:true},location:{href:'https://example.test/index.html',search:''},dispatchEvent(){}},
  getSupabaseClient:()=>sb,showToast:(message,type)=>toasts.push({message,type}),showConfirm:async()=>true,
  URL,URLSearchParams,CustomEvent:class {},console,Math:Object.assign(Object.create(Math),{random:()=>0})});
 vm.runInContext(source+'\nthis.api={joinRoom,createRoom,restoreSession};',context);
 return {api:context.api,element,saved,calls,toasts,control};
}
(async()=>{
 const mj=setup();await mj.api.joinRoom();
 assert.equal(mj.element('room-join').style.display,'none','Original create button hidden after connection');
 assert.equal(mj.element('new-session-btn').style.display,'','Connected room owner can create another session');
 await mj.api.createRoom();
 assert.equal(mj.calls[0].name,'df_create_session_room');
 assert.equal(mj.calls[0].args.p_source,'4SSU','Current room passed as campaign source');
 assert.equal(mj.calls[0].args.p_name,'Meneur');
 assert.notEqual(mj.calls[0].args.p_code,'4SSU');
 assert.equal(JSON.parse(mj.saved.get('diceforge_room')).code,mj.calls[0].args.p_code);
 assert.equal(mj.element('room-badge-text').textContent,'Room: '+mj.calls[0].args.p_code);
 assert.equal(mj.element('new-session-btn').style.display,'','Action remains available in new session');
 const player=setup('player');await player.api.joinRoom();
 assert.equal(player.element('new-session-btn').style.display,'none','Players do not see MJ continuation action');
 const refused=setup();await refused.api.joinRoom();refused.control.fail=true;await refused.api.createRoom();
 assert.equal(JSON.parse(refused.saved.get('diceforge_room')).code,'4SSU','Rejected creation preserves current room');
 assert.equal(refused.element('room-badge-text').textContent,'Room: 4SSU');
 assert(refused.toasts.some(t=>t.message.includes('Refus synthétique')));
 const restored=setup();restored.saved.set('diceforge_room',JSON.stringify({code:'4SSU',player:'Meneur',userId:'mj'}));
 await restored.api.restoreSession();
 assert.equal(restored.element('new-session-btn').style.display,'','Continuation available after restoring MJ session');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/<button[^>]*id="new-session-btn"[^>]*onclick="createRoom\(\)"/);
 console.log('PASS session rooms: connected MJ action, source campaign, updated room, player visibility, rejected request and restored session.');
})().catch(error=>{console.error(error);process.exitCode=1;});
