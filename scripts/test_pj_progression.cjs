const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const source=fs.readFileSync('js/pj-progression.js','utf8').replace(/^import .*\r?\n/gm,'').replace(/export /g,'');
function fixture({saveError='',saveMissing=false,network=false}={}) {
 let handler, finishRoll, sheet={state_id:'state',revision:5,fields:{name:'Test'},creation:{phase:'play'},skills:[{id:'skill.test',name:'Estimation',score:50,checked:true}],spells:[],progression:{session:{room_code:'TEST',pool:6,remaining:6,attempts:[]}}};
 const calls=[],storage=new Map(),result={innerHTML:'',style:{}},stage={innerHTML:'',classList:{toggle(){}},querySelector:()=>result};
 const panel={innerHTML:'',addEventListener:(_,callback)=>handler=callback,querySelector:selector=>selector==='[data-xp-stage]'?{replaceWith(node){assert.equal(node,stage);}}:null};
 let fail=network;
 const context={document:{createElement:()=>stage},makeSVG:()=>'<svg></svg>',D3D:{},spellScore:(_,s)=>s.score,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:{randomUUID},console};
 vm.createContext(context);vm.runInContext(fs.readFileSync('js/dice-stage.js','utf8').replace(/export /g,'')+'\n'+source,context);
 const dice={roll(groups,duration,done){calls.push({animation:groups,duration});finishRoll=done;},hide(){calls.push('hide');}};
 const client={async rpc(name,args){
  calls.push({name,args:structuredClone(args)});
  if(fail){fail=false;return {error:{message:'Connexion interrompue'}};}
  const receipt={resource:'skill',resource_id:'skill.test',score:50,roll:80,unlocked:true,request_id:args.p_request};
  return {data:{sheet_data:{...sheet,revision:7,progression:{session:{...sheet.progression.session,attempts:[receipt]}}},receipt}};
 }};
 const mount=context.mountProgression({panel,client,getSheet:()=>sheet,getRoom:()=>({userId:'player',code:'TEST'}),
  save:async()=>{calls.push('save');return saveMissing?null:{sheet_data:{...sheet,revision:6}};},
  getSaveError:()=>saveError,apply:s=>{calls.push('apply');sheet=s;},confirm:async()=>true,lock:flag=>calls.push({lock:flag}),dice,animate:()=>true});
 mount.render();
 const click=(attribute)=>handler({target:{closest:()=>({dataset:{resource:'skill',xpUnlock:'skill.test'},hasAttribute:a=>a===attribute})}});
 return {calls,panel,result,stage,click,finish:()=>finishRoll(),storage,get sheet(){return sheet;}};
}
(async()=>{
 const t=fixture();const action=t.click('data-xp-unlock');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(t.calls.filter(c=>c.name==='df_progression').length,1);
 assert.equal(t.calls.find(c=>c.name==='df_progression').args.p_expected_revision,6,'Use the revision confirmed by the preliminary save');
 assert.equal(t.calls.find(c=>c.animation).animation[0].rolls[0].finalVal,80,'Animate the server value without a new random draw');
 assert(!t.result.innerHTML.includes('>80<'),'Result stays hidden until the animation finishes');
 assert.equal(t.result.style.visibility,'hidden','The result is hidden during 3D rolling, as in the launcher');
 assert.equal(t.stage.className,'dice-stage','Use the original dice frame without custom styles');
 assert(t.panel.innerHTML.includes('class="dice-layout"'));
 assert(t.panel.innerHTML.includes('class="dice-output"'));
 assert(!t.calls.includes('apply'),'Do not reveal the new attempt in the table before the dice stop');
 await t.click('data-xp-unlock');assert.equal(t.calls.filter(c=>c.name==='df_progression').length,1,'Double click while rolling consumes only one attempt');
 t.finish();await action;
 assert(t.result.innerHTML.includes('>80<'));assert.equal(t.sheet.revision,7);assert.equal(t.storage.size,0);
 assert.equal(t.result.style.visibility,'');assert(!t.result.innerHTML.includes('<svg'),'No duplicate die icon in the original result card');
 t.click('data-xp-refresh');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(t.calls.filter(c=>c.animation).length,1,'A status refresh never throws another die');
 const refused=fixture({saveMissing:true,saveError:'Sauvegarde impossible : droits refusés'});
 await refused.click('data-xp-unlock');
 assert.equal(refused.calls.filter(c=>c.name).length,0);assert.equal(refused.calls.filter(c=>c.animation).length,0);
 assert(refused.panel.innerHTML.includes('droits refusés'));assert(refused.panel.innerHTML.includes('Aucune tentative'));
 const retry=fixture({network:true});await retry.click('data-xp-unlock');
 const request=retry.calls.find(c=>c.name).args.p_request;assert.equal(retry.storage.size,1);assert.equal(retry.calls.filter(c=>c.animation).length,0);
 const recovered=retry.click('data-xp-retry');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(retry.calls.filter(c=>c.name)[1].args.p_request,request,'Recovery uses the exact request UUID');
 assert.equal(retry.calls.filter(c=>c==='save').length,1,'Recovery never resaves or makes another attempt');
 retry.finish();await recovered;assert.equal(retry.storage.size,0);
 console.log('PASS progression: confirmed save, exact animated server roll, delayed reveal, double click, precise refusal and idempotent recovery.');
})().catch(error=>{console.error(error);process.exitCode=1;});
