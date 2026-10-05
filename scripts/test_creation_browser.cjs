// Browser smoke test; mocked identity/database only, no production network calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.argv[2] || 'playwright');
const root=path.resolve(__dirname,'..');
const destination=process.argv[3];
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const filename=path.resolve(root,'.'+pathname);
 if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 const types={'.js':'application/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'};
 fs.readFile(filename,(error,body)=>{res.writeHead(error?404:200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream'});res.end(error?'Not found':body);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 let browser;
 try{browser=await chromium.launch({headless:true});}catch{browser=await chromium.launch({headless:true,channel:'chrome'});}
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==base)return route.abort();
   if(url.pathname==='/supabase-config.js')return route.fulfill({contentType:'application/javascript',body:'window.SUPABASE_CONFIG={url:"https://synthetic.invalid",anonKey:"synthetic",characterV2:true};'});
   if(url.pathname==='/js/supabase-client.js')return route.fulfill({contentType:'application/javascript',body:'export function getSupabaseClient(){return window.__testClient;}'});
   return route.continue();
  });
  await context.addInitScript(({xp,learn})=>{
   localStorage.setItem('diceforge_room',JSON.stringify({code:'TEST',userId:'owner',player:'Player'}));
   let sheet={state_id:'synthetic-state',character_id:'synthetic-character',campaign_id:'synthetic-campaign',revision:1,
    creation:{phase:'draft',origin:'creation'},fields:{name:'Test création',player:'Player',profession:'Sorcier',race:'Humain',skillProfessionalPool:'325'},
    stats:{force:12,constitution:12,taille:12,intelligence:16,pouvoir:13,dexterite:12,apparence:12},
    skills:Array.from({length:57},()=>({})),spells:[],weapons:[]};
   if((xp || learn) && localStorage.getItem('__xpMockState'))sheet=JSON.parse(localStorage.getItem('__xpMockState'));
   const persist=()=>{if(xp || learn)localStorage.setItem('__xpMockState',JSON.stringify(sheet));};
   window.__calls=[];
   const receipts=new Map();
   const row=()=>({id:sheet.state_id,revision:sheet.revision,sheet_data:structuredClone(sheet),character_name:sheet.fields.name,markdown_content:'',updated_at:'2026-10-03T08:00:00Z'});
   window.__testClient={auth:{getUser:async()=>({data:{user:{id:'owner',email:'player@diceforge.app'}},error:null})},
    from:resource=>{let saving=null;const query={select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},
     upsert(value){saving=value;return this;},maybeSingle:async()=>({data:resource==='personnages'?{genre:'Masculin'}:row(),error:null}),
     then(resolve,reject){if(saving){sheet={...saving.sheet_data,revision:sheet.revision+1,creation:sheet.creation};window.__markdown=saving.markdown_content;persist();}return Promise.resolve({data:[row()],error:null}).then(resolve,reject);}};return query;},
    rpc:async(name,args)=>{
     window.__calls.push({name,args});
     if(name==='df_character_roster')return {data:{characters:[],selected_character_id:null,is_mj:false},error:null};
     if(name==='df_validate_creation') {
      sheet={...sheet,revision:sheet.revision+1,creation:{phase:'play',origin:'creation'},progression:{xp_points:0,session:{room_code:'TEST',pool:8,remaining:8,attempts:[]}}};
      if(xp){sheet.skills[0].name='Estimation';sheet.skills[0].checked=true;sheet.spells=['Feu','Givre'].map(name=>({id:`spell.${name.toLowerCase()}`,name,points:20,checked:true,allocation:{score:36,xp_points:0,inherited_points:20}}));}
      persist();
      return {data:{sheet_data:structuredClone(sheet)},error:null};
     }
     if(name==='df_learn_spell') {
      let receipt=sheet.spells.find(s=>s.allocation?.learning?.request_id===args.p_request)?.allocation.learning;
      if(!receipt) {
       receipt={name:'Feu',spell_id:args.p_spell,score:32,dice:[3,4,5],request_id:args.p_request};
       sheet.spells.push({id:args.p_spell,name:'Feu',points:32,checked:false,allocation:{base:0,score:32,xp_points:0,learning_points:32,origin:'learning',learning:receipt}});
       sheet.progression.learning_points=(sheet.progression.learning_points || 0)+32;sheet.revision++;
      }
      persist();
      if(window.__loseNextResponse){window.__loseNextResponse=false;return {data:null,error:{message:'Connexion interrompue'}};}
      return {data:{sheet_data:structuredClone(sheet),receipt},error:null};
     }
     if(name!=='df_progression')throw Error('Unexpected RPC '+name);
     let receipt=receipts.get(args.p_request) || sheet.progression.session.attempts.find(a=>a.request_id===args.p_request);
     const session=sheet.progression.session;
     if(!receipt) {
      const target=sheet[args.p_resource==='spell'?'spells':'skills'].find(s=>s.id===args.p_id);
      if(args.p_operation==='unlock') {
       const roll=window.__nextRoll ?? 80;delete window.__nextRoll;
       const score=args.p_resource==='spell'?target.allocation.score+target.allocation.xp_points:Number(target.score);
       receipt={resource:args.p_resource,resource_id:args.p_id,roll,score,unlocked:roll>score,request_id:args.p_request};session.attempts.push(receipt);
      } else if(args.p_operation==='spend') {
       target.points=Number(target.points)+args.p_amount;target.score=Number(target.score)+args.p_amount;target.allocation={...target.allocation,xp_points:Number(target.allocation?.xp_points || 0)+args.p_amount};
       session.remaining-=args.p_amount;sheet.progression.xp_points+=args.p_amount;receipt={amount:args.p_amount,request_id:args.p_request};
      } else if(args.p_operation==='close') {session.closed_at='synthetic';session.lost=session.remaining;session.remaining=0;}
      sheet.revision++;
      if(receipt)receipts.set(args.p_request,receipt);
     }
     persist();
     const data={sheet_data:structuredClone(sheet),session:structuredClone(session),receipt};
     if(window.__loseNextResponse){window.__loseNextResponse=false;return {data:null,error:{message:'Connexion interrompue'}};}
     return {data,error:null};
    }};
   window.__xpTest=xp;
  },{xp:process.env.DF_TEST_PROGRESSION_UI==='1',learn:process.env.DF_TEST_LEARNING_UI==='1'});
  await page.goto(base+'/pj.html',{waitUntil:'networkidle'});
  await page.locator('#pj-validate-creation').waitFor({state:'visible'});
  const sex=page.getByLabel('Sexe',{exact:true});
  assert.equal(await sex.inputValue(),'Masculin','Older sheets recover the generator identity');
  await sex.fill('Féminin');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('dice-forge.pj-markdown.v2:owner:TEST')).fields.sex==='Féminin');
  assert.equal(await page.locator('[data-stat="intelligence"]').evaluate(e=>e.readOnly),true);
  assert.equal(await page.locator('#pj-validate-creation').isDisabled(),true,'Unspent creation budget cannot be validated');
  await page.locator('[data-skill-points="0"]').fill('25');
  await page.locator('[data-skill-points="0"]').press('Tab');
  for(const eligible of [true,false]) {
   for(const input of await page.locator('[data-skill-points]').all()) {
    const index=await input.getAttribute('data-skill-points');
    if(index==='0')continue;
    const star=(await page.locator(`[data-profession-star="${index}"]`).textContent()).includes('★');
    if(star!==eligible)continue;
    const available=Number(await page.locator(eligible?'#pj-skill-professional-remaining':'#pj-skill-personal-remaining').textContent());
    if(!available)break;
    const maximum=Number(await input.getAttribute('max'));
    await input.fill(String(Math.min(available,maximum)));
    await input.press('Tab');
   }
  }
  assert.equal(await page.locator('#pj-skill-remaining').textContent(),'0');
  assert.equal(await page.locator('#pj-validate-creation').isDisabled(),false,'Full valid allocation enables validation');
  await page.locator('#pj-validate-creation').click();
  await page.getByRole('button',{name:'Valider la création',exact:true}).last().click();
  await page.waitForFunction(()=>document.querySelector('#pj-form').classList.contains('pj-creation-locked'));
  assert.match(await page.evaluate(()=>window.__markdown),/\*\*Sexe :\*\* Féminin/,'The saved Markdown includes sex');
  assert.equal(await sex.inputValue(),'Féminin','A canonical save retains the edited identity');
  assert.equal(await page.locator('#pj-validate-creation').isVisible(),false);
  assert.equal(await page.locator('[data-stat="intelligence"]').evaluate(e=>e.readOnly),true);
  assert.equal(await page.locator('[data-skill-points="0"]').evaluate(e=>e.readOnly),true);
  assert.equal(await page.locator('[data-skill-check="0"]').isEnabled(),false);
  assert.equal(await page.locator('[data-field="notes"]').isEnabled(),true);
  assert.equal(await page.locator('[data-skill-base="0"]').isVisible(),false);
  assert.equal(await page.locator('[data-skill-final="0"]').isVisible(),true);
  assert.equal(await page.locator('.pj-skill-budget').first().isVisible(),true,'Creation counters remain visible after validation');
  assert.match(await page.locator('#pj-creation-status').textContent(),/Session TEST : 8\/8 XP disponibles/);
  const calls=await page.evaluate(()=>window.__calls.filter(call=>call.name!=='df_character_roster'));
  assert.equal(calls.length,1);assert.equal(calls[0].name,'df_validate_creation');assert.equal(calls[0].args.p_expected_revision,2);
  if(process.env.DF_TEST_LEARNING_UI==='1') {
   await page.locator('[data-field="notes"]').fill('Notes conservées à l’apprentissage');
   await page.getByRole('tab',{name:'Sorts et Pouvoirs',exact:true}).click();
   await page.locator('#pj-add-spell').click();
   await page.locator('#pj-new-spell').selectOption('Feu');
   assert.equal(await page.locator('#pj-new-spell-points').isVisible(),false,'No free learning allocation input');
   await page.locator('#pj-confirm-spell').click();
   assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.name==='df_learn_spell').length),0,'Confirmation and study source are required');
   await page.locator('#pj-learning-source').fill('Grimoire validé oralement par le MJ');
   await page.locator('#pj-learning-confirmed').check();
   await page.evaluate(()=>window.__loseNextResponse=true);
   await page.locator('#pj-confirm-spell').click();
   await page.locator('#pj-learning-retry').waitFor({state:'visible'});
   await page.reload({waitUntil:'networkidle'});
   await page.getByRole('tab',{name:'Sorts et Pouvoirs',exact:true}).click();
   await page.locator('#pj-learning-retry').click();
   await page.waitForFunction(()=>document.querySelector('#pj-spells-status').textContent.includes('= 32 %'));
   assert.equal(await page.locator('[data-spell-final="0"]').textContent(),'32');
   assert.equal(await page.locator('[data-spell-points="0"]').evaluate(el=>el.readOnly),true);
   assert.equal(await page.locator('[data-spell-check="0"]').isEnabled(),false);
   const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('__xpMockState')));
   assert.equal(persisted.spells.length,1);assert.equal(persisted.progression.session.remaining,8);assert.equal(persisted.progression.learning_points,32);
   assert.equal((await page.evaluate(()=>window.__calls.find(c=>c.name==='df_learn_spell'))).args.p_request,persisted.spells[0].allocation.learning.request_id);
   assert.match(await page.evaluate(()=>window.__markdown),/\| Feu \| 0 \| 32 \| 32 \|/);
   await page.getByRole('tab',{name:'Fiche',exact:true}).click();
   assert.equal(await page.locator('[data-field="notes"]').inputValue(),'Notes conservées à l’apprentissage');
   await page.locator('#pj-pdf').click();
   await page.waitForURL('**/pj-print.html');
   await page.locator('#print-sheet').waitFor({state:'visible'});
   const printedSpell=page.locator('#print-sheet tr').filter({hasText:'Feu'});
   assert.equal(await printedSpell.locator('td').count(),3,'Locked PDF shows only name, score and checkbox');
   assert.equal(await printedSpell.locator('td').nth(1).textContent(),'32','PDF uses the exact acquired score');
   await page.goBack({waitUntil:'networkidle'});
   await page.getByRole('tab',{name:'Sorts et Pouvoirs',exact:true}).click();
   console.log('PASS spell learning browser: oral confirmation, fixed 32%, reserved attribution, same UUID after reload, no duplicate, notes, checks and Markdown.');
  }
  if(process.env.DF_TEST_PROGRESSION_UI==='1') {
   await page.locator('[data-field="notes"]').fill('Notes à préserver pendant le gain');
   await page.getByRole('tab',{name:'Progression',exact:true}).click();
   await page.locator('[data-xp-unlock]').first().waitFor({state:'visible'});
   await page.evaluate(()=>window.__loseNextResponse=true);
   await page.locator('[data-xp-unlock]').first().click();
   await page.locator('[data-xp-retry]').waitFor({state:'visible'});
   assert.equal(await page.locator('[data-xp-refresh]').isDisabled(),true,'Unknown outcome cannot be overwritten by another request');
   await page.reload({waitUntil:'networkidle'});
   await page.getByRole('tab',{name:'Progression',exact:true}).click();
   await page.locator('[data-xp-retry]').click();
   await page.locator('[data-xp-spend]').waitFor({state:'visible'});
   const attempts=await page.evaluate(()=>window.__calls.filter(c=>c.name==='df_progression' && c.args.p_operation==='unlock'));
   assert.equal(attempts.length,1);
   const storedAttempt=await page.evaluate(()=>JSON.parse(localStorage.getItem('__xpMockState')).progression.session.attempts[0]);
   assert.equal(attempts[0].args.p_request,storedAttempt.request_id,'Reload recovery reuses exact server request');
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('__xpMockState')).progression.session.attempts.length),1);
   assert.match(await page.locator('#pj-progression-panel .result-area').textContent(),/D100 80/);
   await page.locator('#pj-progression-panel input[type=number]').fill('3');
   await page.locator('[data-xp-spend]').click();
   await page.waitForFunction(()=>document.querySelector('.pj-xp-pool').textContent.includes('5 / 8'));
   await page.getByRole('tab',{name:'Fiche',exact:true}).click();
   assert.equal(await page.locator('[data-field="notes"]').inputValue(),'Notes à préserver pendant le gain');
   assert.match(await page.evaluate(()=>window.__markdown),/Notes à préserver pendant le gain/);
   await page.getByRole('tab',{name:'Progression',exact:true}).click();
   await page.locator('[data-xp-unlock="spell.feu"]').click();
   await page.locator('[data-xp-spend][data-resource="spell"]').waitFor({state:'visible'});
   const spellRow=page.locator('[data-xp-spend][data-resource="spell"]').locator('xpath=ancestor::tr');
   assert.match(await spellRow.textContent(),/36 %/);
   await spellRow.locator('input').fill('2');
   await page.locator('[data-xp-spend][data-resource="spell"]').click();
   await page.waitForFunction(()=>document.querySelector('.pj-xp-pool').textContent.includes('3 / 8'));
   assert.match(await page.locator('[data-xp-spend][data-resource="spell"]').locator('xpath=ancestor::tr').textContent(),/38 %/);
   await page.evaluate(()=>window.__nextRoll=36);
   await page.locator('[data-xp-unlock="spell.givre"]').click();
   await page.waitForFunction(()=>document.querySelector('#pj-progression-panel').textContent.includes('Échoué, tentative consommée'));
   assert.equal(await page.locator('[data-xp-unlock="spell.givre"], [data-xp-spend="spell.givre"]').count(),0,'Failed attempt offers neither another roll nor spending');
   await page.locator('[data-xp-close]').click();
   await page.getByRole('button',{name:'Confirmer',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.pj-xp-pool').textContent.includes('3 XP non dépensés perdus'));
   assert.equal(await page.locator('[data-xp-close]').isDisabled(),true);
   assert.match(await page.locator('#pj-creation-status').textContent(),/clôturée/,'Main sheet status must reflect closure too');
   console.log('PASS progression browser: pending checkbox, preserved notes, network recovery with same UUID, spend, Markdown and closure.');
  }
  if(process.env.DF_TEST_DEAD_UI==='1') {
   await page.evaluate(()=>{
    const sheet=JSON.parse(localStorage.getItem('__xpMockState'));
    sheet.lifecycle={status:'dead'};
    sheet.progression.session={...sheet.progression.session,closed_at:new Date().toISOString(),remaining:0,lost:8};
    localStorage.setItem('__xpMockState',JSON.stringify(sheet));
   });
   await page.reload({waitUntil:'networkidle'});
   await page.waitForFunction(()=>document.querySelector('#pj-form').inert);
   assert.match(await page.locator('#pj-creation-status').textContent(),/PJ mort/);
   assert.equal(await page.locator('#pj-cloud-save').isDisabled(),true);
   assert.equal(await page.locator('#pj-save-spells').isDisabled(),true);
   assert.equal(await page.locator('[data-xp-close]').count(),0,'Dead PJ has no XP actions');
   assert.equal(await page.getByRole('button',{name:'Créer un nouveau PJ'}).isEnabled(),true,'Replacement remains available outside readonly sheet');
   console.log('PASS dead PJ browser: preserved sheet, readonly form, no saving or XP actions, replacement access.');
  }
  assert.deepEqual(errors,[]);
  if(destination){fs.mkdirSync(path.dirname(destination),{recursive:true});await page.screenshot({path:destination,fullPage:true});}
  await page.locator('#pj-pdf').click();
  await page.waitForURL('**/pj-print.html');
  assert.equal(await page.locator('.identity .field').filter({hasText:'Sexe'}).locator('.value').textContent(),'Féminin','The PDF snapshot includes sex');
  console.log('PASS browser: save then explicit validation, fresh revision, locked fields, checks/notes editable and simplified columns.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
