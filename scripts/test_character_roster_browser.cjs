const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.argv[2] || 'playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const filename=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(filename,(error,body)=>{res.writeHead(error?404:200,{'Content-Type':filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':'text/html'});res.end(error?'Missing':body);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 let browser;try{browser=await chromium.launch({headless:true,...(process.env.DF_TEST_BROWSER_EXECUTABLE?{executablePath:process.env.DF_TEST_BROWSER_EXECUTABLE}:{})});}catch{browser=await chromium.launch({headless:true,channel:'chrome'});}
 try {
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(url.pathname==='/js/supabase-client.js')return route.fulfill({contentType:'application/javascript',body:'export function getSupabaseClient(){return window.__client;}'});
   if(url.pathname==='/roster-test.html')return route.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="/suivi-mj.css"><main id="roster"></main><script type="module">import {mountCharacterRoster} from "/js/character-roster.js";window.mount=mountCharacterRoster;await mountCharacterRoster(document.getElementById("roster"),{room:{code:"TEST",userId:"owner"},onSelect:()=>window.__selected++});</script>'});
   return route.continue();
  });
  await context.addInitScript(()=>{
   window.SUPABASE_CONFIG={characterV2:true};window.__selected=0;window.__calls=[];
   window.__data={is_mj:false,selected_character_id:'a',deleted_characters:[],members:[{user_id:'player',name:'Lisa'}],characters:[
    {character_id:'a',state_id:'state_a',name:'Ilya',owner_user_id:'owner',status:'active',available:true,can_select:true,can_delete:true},
    {character_id:'b',state_id:'state_b',name:'Autre PJ',owner_user_id:'owner',status:'active',available:true,can_select:true,can_delete:true},
    {character_id:'c',state_id:'state_c',name:'PJ mort',owner_user_id:'owner',status:'dead',available:false,can_select:false,can_delete:true},
    {character_id:'d',name:'Généré',owner_user_id:'owner',status:'active',needs_sheet:true,can_select:false,can_delete:true}
   ]};
   window.__client={async rpc(name,args){window.__calls.push(args);const c=window.__data.characters.find(c=>c.character_id===args.p_character);
    if(args.p_operation==='select')window.__data.selected_character_id=c.character_id;
    if(args.p_operation==='new')window.__data.selected_character_id=null;
    if(args.p_operation==='attach'){c.needs_sheet=false;c.available=true;c.can_select=true;}
    if(args.p_operation==='dead'){c.status='dead';c.available=false;c.can_select=false;}
    if(args.p_operation==='withdraw')c.available=false;
    if(args.p_operation==='offer')c.available=true;
    if(args.p_operation==='preset'){c.preset=true;c.reserved_user_id=args.p_reserved_user;}
    if(args.p_operation==='delete'){
     window.__data.characters=window.__data.characters.filter(item=>item!==c);
     window.__data.deleted_characters.push({...c,status:'deleted',previous_status:c.status,can_restore:true});
     if(window.__data.selected_character_id===c.character_id)window.__data.selected_character_id=null;
    }
    if(args.p_operation==='restore'){
     const item=window.__data.deleted_characters.find(item=>item.character_id===args.p_character);
     window.__data.deleted_characters=window.__data.deleted_characters.filter(c=>c!==item);
     window.__data.characters.push({...item,status:item.previous_status});
    }
    return {data:structuredClone(window.__data),error:null};}};
   window.__client.auth={getUser:async()=>({data:{user:{id:'owner'}},error:null})};
   window.__client.from=table=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{owner_id:'owner'},error:null}),order:async()=>({data:window.__data.characters.filter(c=>c.state_id&&!c.needs_sheet).map(c=>({id:c.state_id,character_id:c.character_id,character_status:c.status,room_code:'TEST',player_name:'Joueur',character_name:c.name,sheet_data:{fields:{name:c.name},stats:{constitution:12,taille:12},skills:[]}})),error:null})});
  });
  await page.goto(base+'/roster-test.html',{waitUntil:'networkidle'});
  assert.equal(await page.getByRole('option',{name:'PJ mort'}).count(),0,'Dead PJ is not offered');
  assert.equal(await page.getByRole('button',{name:/^Supprimer/}).count(),0,'No delete button in player mode');
  await page.getByRole('combobox',{name:'Personnage disponible'}).selectOption('b');
  await page.getByRole('button',{name:'Choisir ce PJ'}).click();
  await page.waitForFunction(()=>window.__selected===1);
  assert.equal(await page.evaluate(()=>localStorage.getItem('diceforge_character:owner:TEST')),'b');
  await page.getByRole('button',{name:'Créer la fiche de Généré'}).click();
  await page.getByRole('option',{name:'Généré'}).waitFor({state:'attached'});
  await page.evaluate(()=>localStorage.setItem('dice-forge.pj-markdown.v2:owner:TEST:new','previous draft'));
  await page.getByRole('button',{name:'Créer un nouveau PJ'}).click();
  await page.waitForFunction(()=>window.__selected===2);
  assert.equal(await page.evaluate(()=>localStorage.getItem('diceforge_character:owner:TEST')),'new');
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('dice-forge.pj-markdown.v2:owner:TEST:new:archive:'))),true,'Previous creation draft is archived before a new one');
  await page.evaluate(async()=>{window.__data.is_mj=true;await window.mount(document.getElementById('roster'),{room:{code:'TEST',userId:'owner'},manager:true});});
  const row=page.locator('#roster p').filter({has:page.locator('strong',{hasText:'Ilya'})});
  await row.getByRole('combobox').selectOption('player');
  await row.getByRole('button',{name:'Proposer comme prétiré'}).click();
  await page.waitForFunction(()=>window.__calls.some(c=>c.p_operation==='preset'));
  assert.equal(await page.evaluate(()=>window.__calls.find(c=>c.p_operation==='preset').p_reserved_user),'player');
  await row.getByRole('button',{name:'Déclarer mort'}).click();
  assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.p_operation==='dead').length),0,'No death before explicit confirmation');
  await page.getByRole('button',{name:'Confirmer',exact:true}).click();
  await page.waitForFunction(()=>window.__data.characters[0].status==='dead');
  assert.match(await row.textContent(),/mort/);
  assert.equal(await row.getByRole('button',{name:'Rendre disponible'}).count(),0,'Death cannot be cancelled through availability button');
  await row.getByRole('button',{name:'Supprimer Ilya',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.p_operation==='delete').length),0,'No deletion before explicit confirmation');
  await page.getByRole('button',{name:'Annuler',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.p_operation==='delete').length),0,'Cancelled deletion never reaches the server');
  await row.getByRole('button',{name:'Supprimer Ilya',exact:true}).click();
  await page.getByRole('button',{name:'Supprimer le personnage',exact:true}).click();
  await page.waitForFunction(()=>window.__data.deleted_characters.length===1);
  assert.equal(await page.locator('#roster > div > p').filter({hasText:'Ilya'}).count(),0,'Deleted PJ removed from ordinary manager list');
  await page.getByText('Corbeille MJ · 1 personnage',{exact:true}).click();
  await page.getByRole('button',{name:'Restaurer',exact:true}).click();
  await page.getByRole('button',{name:'Restaurer le personnage',exact:true}).click();
  await page.waitForFunction(()=>window.__data.deleted_characters.length===0);
  assert.match(await row.textContent(),/mort/,'Restoring a dead PJ does not revive it');
  const identityBefore=await page.evaluate(()=>localStorage.getItem('diceforge_character:owner:TEST'));
  await page.evaluate(async()=>{
    window.__workingClient=window.__client;
    window.__client={rpc:async()=>({data:null,error:{code:'PGRST202',message:'Could not find the function public.df_character_roster in the schema cache'}})};
    await window.mount(document.getElementById('roster'),{room:{code:'TEST',userId:'owner'}});
  });
  assert.match(await page.locator('#roster [role="status"]').textContent(),/pas encore disponible/);
  assert.equal(await page.getByRole('button',{name:'Choisir ce PJ'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Créer un nouveau PJ'}).count(),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('diceforge_character:owner:TEST')),identityBefore,'Missing migration cannot change the current identity');
  await page.evaluate(async()=>{
    window.__client={rpc:async()=>({data:null,error:{code:'42501',message:'Accès refusé'}})};
    await window.mount(document.getElementById('roster'),{room:{code:'TEST',userId:'owner'}});
  });
  assert.match(await page.locator('#roster [role="status"]').textContent(),/Accès refusé/,'Permission errors remain explicit');
  await page.evaluate(async()=>{
    window.__client=window.__workingClient;
    await window.mount(document.getElementById('roster'),{room:{code:'TEST',userId:'owner'}});
  });
  assert.equal(await page.getByRole('combobox',{name:'Personnage disponible'}).count(),1,'Selection returns when the server exposes the function');
  const notebook=await context.newPage();notebook.on('pageerror',error=>errors.push(error.message));
  await notebook.addInitScript(()=>localStorage.setItem('dice-forge.mj-notebook.v1.TEST',JSON.stringify({version:1,campaign:'Recette suppression',characters:[{name:'Ilya',sourceId:'state_a',sourceRoom:'TEST',secret:'Note MJ à conserver'}],group:{}})));
  await notebook.goto(base+'/suivi-mj.html?room=TEST',{waitUntil:'networkidle'});
  await notebook.evaluate(()=>window.__data.is_mj=true);
  await notebook.getByRole('button',{name:'Actualiser les fiches de la room',exact:true}).click();
  await notebook.getByRole('button',{name:'Supprimer Ilya',exact:true}).click();
  await notebook.getByRole('button',{name:'Supprimer le personnage',exact:true}).click();
  await notebook.waitForFunction(()=>JSON.parse(localStorage.getItem('dice-forge.mj-notebook.v1.TEST')).characters.find(c=>c.sourceId==='state_a').sourceDeleted==='yes');
  assert.equal(await notebook.locator('#cards summary').filter({hasText:'Ilya'}).count(),0,'Deleted PJ also disappears from the local GM notebook');
  assert.equal(await notebook.evaluate(()=>JSON.parse(localStorage.getItem('dice-forge.mj-notebook.v1.TEST')).characters.find(c=>c.sourceId==='state_a').secret),'Note MJ à conserver','Deletion retains local GM notes');
  await notebook.getByRole('button',{name:'Actualiser les fiches de la room',exact:true}).click();
  assert.equal(await notebook.locator('#cards summary').filter({hasText:'Ilya'}).count(),0,'Refresh cannot bring a deleted PJ back');
  await notebook.getByText('Corbeille MJ · 1 personnage',{exact:true}).click();
  await notebook.getByRole('button',{name:'Restaurer',exact:true}).click();
  await notebook.getByRole('button',{name:'Restaurer le personnage',exact:true}).click();
  await notebook.locator('#cards summary').filter({hasText:'Ilya'}).waitFor({state:'visible'});
  assert.equal(await notebook.evaluate(()=>JSON.parse(localStorage.getItem('dice-forge.mj-notebook.v1.TEST')).characters.find(c=>c.sourceId==='state_a').secret),'Note MJ à conserver','Restoration recovers local GM notes');
  if(process.argv[3])await notebook.screenshot({path:process.argv[3],fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS roster browser: selection, death, deletion confirmation/cancellation, GM trash, restoration and notebook notes preserved.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
