const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
  const {campaignClient} = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('js/character-store.js','utf8')).toString('base64'));
  const calls=[];
  let answer={data:{rows:[{id:'state',revision:3,sheet_data:{revision:3}}]},error:null};
  const legacy={select(){calls.push('legacy-select');return this;},eq(){return this;},maybeSingle(){return Promise.resolve({data:{old:true},error:null});},
    upsert(value){assert.equal('expected_revision' in value,false,'Legacy tables cannot accept the v2 revision column');return Promise.resolve({data:null,error:null});}};
  const original={auth:{test:true},from(){return legacy;},async rpc(name,args){calls.push({name,args});return answer;}};
  const client=campaignClient(original,()=>({code:'4SSU'}));
  assert.equal(client.auth,original.auth);
  let result=await client.from('pj_sheets').select('*').eq('user_id','owner').maybeSingle();
  assert.equal(result.data.id,'state'); assert.equal(calls[0].args.p_room,'4SSU');
  await client.from('pj_sheets').upsert({user_id:'owner',sheet_data:{revision:2}},{});
  assert.equal(calls[1].args.p_payload.expected_revision,2);
  answer={data:{legacy:true},error:null};
  result=await client.from('pj_sheets').select('*').eq('user_id','owner').maybeSingle();
  assert.equal(result.data.old,true);
  result=await client.from('pj_inventory').upsert({user_id:'owner',expected_revision:8,po:5},{});
  assert.equal(result.error,null,'Inventory remains writable after switching back to legacy');
  answer={data:null,error:{code:'42501',message:'Forbidden'}};
  const count=calls.filter(x=>x==='legacy-select').length;
  result=await client.from('pj_sheets').select('*').maybeSingle();
  assert.equal(result.error.code,'42501');
  assert.equal(calls.filter(x=>x==='legacy-select').length,count,'An access denial must never fall back to legacy');
  assert.equal(client.from('rolls'),legacy,'Dice feed remains on its dedicated table');
  const app=fs.readFileSync('js/app.js','utf8');
  const hydrate=app.slice(app.indexOf('function hydrateSavedCharacter('),app.indexOf('async function refreshCharacterFromSupabase('));
  const frame={dataset:{src:'pj.html?embedded=1'},src:'https://example.test/pj.html?syncGenerated=1',
    getAttribute(){return this.src;},setAttribute(key,value){this.src=value;}};
  const context={URL,console,characterSheetNeedsSync:true,normalizeImportedCharacter:r=>r,
    applyCharacterToSheet(){context.characterSheetNeedsSync=true;},
    characterDraftKey:()=> 'draft:owner:4SSU',document:{getElementById:()=>frame},
    window:{location:{href:'https://example.test/index.html'}}};
  vm.createContext(context); vm.runInContext(hydrate,context);
  context.hydrateSavedCharacter({state_id:'campaign-state'});
  assert.equal(context.characterSheetNeedsSync,false,'A saved campaign must load its full sheet instead of the generator draft');
  assert.equal(new URL(frame.src).searchParams.has('syncGenerated'),false);
  assert.equal(new URL(frame.src).searchParams.get('state'),'campaign-state');
  context.hydrateSavedCharacter({nom:'New generator'});
  assert.equal(context.characterSheetNeedsSync,true,'A new generator still supports sheet creation');
  console.log('Campagnes : lectures, révisions, retour ancien et refus d’accès validés.');
})().catch(error=>{console.error(error);process.exitCode=1;});
