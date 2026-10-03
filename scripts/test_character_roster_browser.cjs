const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.argv[2] || 'playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const filename=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(filename,(error,body)=>{res.writeHead(error?404:200,{'Content-Type':filename.endsWith('.js')?'application/javascript':'text/html'});res.end(error?'Missing':body);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 let browser;try{browser=await chromium.launch({headless:true});}catch{browser=await chromium.launch({headless:true,channel:'chrome'});}
 try {
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(url.pathname==='/js/supabase-client.js')return route.fulfill({contentType:'application/javascript',body:'export function getSupabaseClient(){return window.__client;}'});
   if(url.pathname==='/roster-test.html')return route.fulfill({contentType:'text/html',body:'<main id="roster"></main><script type="module">import {mountCharacterRoster} from "/js/character-roster.js";window.mount=mountCharacterRoster;await mountCharacterRoster(document.getElementById("roster"),{room:{code:"TEST",userId:"owner"},onSelect:()=>window.__selected++});</script>'});
   return route.continue();
  });
  await context.addInitScript(()=>{
   window.SUPABASE_CONFIG={characterV2:true};window.__selected=0;window.__calls=[];
   window.__data={is_mj:false,selected_character_id:'a',members:[{user_id:'player',name:'Lisa'}],characters:[
    {character_id:'a',name:'Ilya',owner_user_id:'owner',status:'active',available:true,can_select:true},
    {character_id:'b',name:'Autre PJ',owner_user_id:'owner',status:'active',available:true,can_select:true},
    {character_id:'c',name:'PJ mort',owner_user_id:'owner',status:'dead',available:false,can_select:false},
    {character_id:'d',name:'Généré',owner_user_id:'owner',status:'active',needs_sheet:true,can_select:false}
   ]};
   window.__client={async rpc(name,args){window.__calls.push(args);const c=window.__data.characters.find(c=>c.character_id===args.p_character);
    if(args.p_operation==='select')window.__data.selected_character_id=c.character_id;
    if(args.p_operation==='new')window.__data.selected_character_id=null;
    if(args.p_operation==='attach'){c.needs_sheet=false;c.available=true;c.can_select=true;}
    if(args.p_operation==='dead'){c.status='dead';c.available=false;c.can_select=false;}
    if(args.p_operation==='withdraw')c.available=false;
    if(args.p_operation==='offer')c.available=true;
    if(args.p_operation==='preset'){c.preset=true;c.reserved_user_id=args.p_reserved_user;}
    return {data:structuredClone(window.__data),error:null};}};
  });
  await page.goto(base+'/roster-test.html',{waitUntil:'networkidle'});
  assert.equal(await page.getByRole('option',{name:'PJ mort'}).count(),0,'Dead PJ is not offered');
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
  assert.deepEqual(errors,[]);
  if(process.argv[3])await page.screenshot({path:process.argv[3],fullPage:true});
  console.log('PASS roster browser: explicit selection, permanent identity, generated sheet, MJ reservation by player name, death confirmation and no revival button.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
