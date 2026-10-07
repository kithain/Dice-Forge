const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../js/supabase-room.js'),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
function setup(userId='mj') {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      style:{},value:'',textContent:'',innerHTML:'',children:[],hidden:false,open:false,events:{},
      addEventListener(name,handler){this.events[name]=handler;},
      append(child){this.children.push(child);},replaceChildren(){this.children=[];},
      reportValidity(){return true;},showModal(){this.open=true;},close(){this.open=false;}
    });
    return elements.get(id);
  };
  element('player-name').value='Meneur';element('room-code').value='4SSU';
  const saved=new Map(),calls=[],toasts=[];
  const control={fail:false,failMetadata:false};
  const campaigns=[{id:'valombre-id',name:'Valombre',description:'La campagne',can_manage:userId==='mj',room_count:8},
    {id:'aurore-id',name:'Aurore',description:'Autre campagne',can_manage:userId==='mj',room_count:0}];
  const sb={auth:{getUser:async()=>({data:{user:{id:userId}},error:null})},
    from(table) {
      return {select(){return this;},eq(){return this;},neq(){return this;},order(){return this;},
        insert:async()=>{throw Error('No direct room insertion permitted');},upsert:async()=>({error:null}),
        limit(){return Promise.resolve({data:table==='rooms'?[{room_code:'4SSU',owner_id:'mj'}]:[],error:null});}};
    },
    async rpc(name,args) {
      calls.push({name,args});
      if (name==='df_create_session_room') return control.fail ? {error:{message:'Refus synthétique'},data:null} :
        {error:null,data:{room_code:args.p_code,campaign_id:args.p_campaign,campaign_name:campaigns.find(c=>c.id===args.p_campaign).name}};
      if (control.failMetadata) return {error:{message:'Metadata unavailable'},data:null};
      if (args.p_operation==='create') {
        const c={id:'new-id',name:args.p_name,description:args.p_description,can_manage:true,room_count:0};campaigns.push(c);
        return {error:null,data:{is_mj:true,campaigns,campaign:c}};
      }
      return {error:null,data:{is_mj:userId==='mj',campaigns:userId==='mj'?campaigns:[campaigns[0]],
        ...(args.p_operation==='room'?{campaign:campaigns[0]}:{})}};
    },
    channel(){return {on(){return this;},subscribe(){return this;},unsubscribe(){}};}
  };
  const context=vm.createContext({document:{getElementById:element,createElement:()=>element('option-'+Math.random())},
    localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)},
    window:{SUPABASE_CONFIG:{characterV2:true},location:{href:'https://example.test/index.html',search:''},dispatchEvent(){}},
    getSupabaseClient:()=>sb,showToast:(message,type)=>toasts.push({message,type}),showConfirm:async()=>true,
    URL,URLSearchParams,CustomEvent:class {},console,Math:Object.assign(Object.create(Math),{random:()=>0})});
  vm.runInContext(source+'\nthis.api={joinRoom,createRoom,submitCampaignRoom,restoreSession,openCampaignManager,saveCampaign};',context);
  return {api:context.api,element,saved,calls,toasts,control};
}
(async()=>{
  const mj=setup();await mj.api.joinRoom();
  assert.equal(mj.element('room-campaign-name').textContent,'Campagne : Valombre');
  assert.equal(mj.element('room-campaign-id').textContent,'valombre-id');
  assert.equal(mj.element('campaign-manager-btn').hidden,false);
  await mj.api.createRoom();
  assert.equal(mj.element('room-create-dialog').open,true,'MJ explicitly confirms the campaign in a form');
  assert.equal(mj.calls.filter(c=>c.name==='df_create_session_room').length,0,'Opening form creates no room');
  assert.equal(mj.element('room-campaign-select').value,'valombre-id','Current campaign is offered');
  mj.element('room-campaign-select').value='';await mj.api.submitCampaignRoom();
  assert.equal(mj.calls.filter(c=>c.name==='df_create_session_room').length,0,'Missing campaign blocks creation');
  mj.element('room-campaign-select').value='valombre-id';await mj.api.submitCampaignRoom();
  const call=mj.calls.find(c=>c.name==='df_create_session_room');
  assert.equal(call.args.p_source,'4SSU');assert.equal(call.args.p_campaign,'valombre-id');
  assert.equal(call.args.p_name,'Meneur');
  assert.equal(JSON.parse(mj.saved.get('diceforge_room')).code,call.args.p_code);
  assert.equal(JSON.parse(mj.saved.get('diceforge_room')).campaignId,'valombre-id');
  assert.equal(mj.element('room-create-dialog').open,false);
  await mj.api.createRoom();mj.element('room-campaign-select').value='aurore-id';await mj.api.submitCampaignRoom();
  const other=mj.calls.filter(c=>c.name==='df_create_session_room').at(-1);
  assert.equal(other.args.p_source,null,'Switching campaign never supplies an incompatible source room');
  assert.equal(other.args.p_campaign,'aurore-id');
  assert.equal(mj.element('room-campaign-name').textContent,'Campagne : Aurore');
  await mj.api.openCampaignManager();mj.element('campaign-editor-select').value='';
  mj.element('campaign-name-input').value='Crépuscule';mj.element('campaign-description-input').value='Une troisième aventure';
  await mj.api.saveCampaign();
  const created=mj.calls.find(c=>c.name==='df_campaigns'&&c.args.p_operation==='create');
  assert.equal(created.args.p_description,'Une troisième aventure');
  assert.equal(mj.element('room-campaign-select').value,'new-id');
  const player=setup('player');await player.api.joinRoom();await player.api.createRoom();
  assert.equal(player.element('new-session-btn').style.display,'none');
  assert.equal(player.element('campaign-manager-btn').hidden,true);
  assert.equal(player.element('room-create-dialog').open,false);
  const refused=setup();await refused.api.joinRoom();await refused.api.createRoom();refused.control.fail=true;
  await refused.api.submitCampaignRoom();
  assert.equal(JSON.parse(refused.saved.get('diceforge_room')).code,'4SSU','Rejected creation keeps current room');
  assert(refused.toasts.some(t=>t.message.includes('Refus synthétique')));
  const restored=setup();restored.saved.set('diceforge_room',JSON.stringify({code:'4SSU',player:'Meneur',userId:'mj',campaignId:'stale-id'}));
  await restored.api.restoreSession();
  assert.equal(restored.element('room-campaign-id').textContent,'valombre-id','Restoration reloads authoritative campaign metadata');
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.match(html,/<select[^>]*id="room-campaign-select"[^>]*required/);
  console.log('PASS campaign room UI: required selection, MJ management, identity, isolation, failure and restoration.');
})().catch(error=>{console.error(error);process.exitCode=1;});
