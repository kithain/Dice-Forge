// UI regression with synthetic data. All remote requests are blocked.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const os=require('node:os');
const {chromium}=require(process.argv[2] || 'playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const filename=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(filename,(error,body)=>{
    if(!error&&filename.endsWith('index.html')) body=Buffer.from(body.toString().replace(/<script type="module" src="js\/app.js[^>]*><\/script>/,
      '<script type="module">import * as api from "/js/supabase-room.js";Object.assign(window,api);await api.restoreSession();window.__ready=true;</script>'));
    res.writeHead(error?404:200,{'Content-Type':filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':'text/html'});res.end(error?'Missing':body);
  });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,...(process.env.DF_TEST_BROWSER_EXECUTABLE
    ? {executablePath:process.env.DF_TEST_BROWSER_EXECUTABLE} : {})});
  try{
    const context=await browser.newContext();const page=await context.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
      if(url.pathname==='/js/auth-guard.js')return route.fulfill({contentType:'application/javascript',body:'document.documentElement.classList.remove("auth-pending");'});
      if(url.pathname==='/js/supabase-client.js')return route.fulfill({contentType:'application/javascript',body:'export function getSupabaseClient(){return window.__client;}'});
      return route.continue();
    });
    await context.addInitScript(()=>{
      window.__calls=[];window.__mj=true;
      window.__campaigns=[{id:'11111111-1111-4111-8111-111111111111',name:'Valombre',description:'Campagne historique',can_manage:true,room_count:8},
        {id:'22222222-2222-4222-8222-222222222222',name:'Aurore',description:'Autre aventure',can_manage:true,room_count:0}];
      localStorage.setItem('diceforge_room',JSON.stringify({code:'4SSU',player:'Meneur',userId:'mj'}));
      window.__client={auth:{getUser:async()=>({data:{user:{id:window.__mj?'mj':'player'}},error:null})},
        from(table){return {select(){return this;},eq(){return this;},order(){return this;},upsert:async()=>({error:null}),
          limit:async()=>({data:table==='rooms'?[{room_code:'4SSU',owner_id:'mj'}]:[],error:null})};},
        async rpc(name,args){
          window.__calls.push({name,args});
          if(name==='df_create_session_room')return {data:{room_code:args.p_code,campaign_id:args.p_campaign},error:null};
          let chosen=args.p_operation==='room'?window.__campaigns[0]:null;
          if(args.p_operation==='create'){
            chosen={id:'33333333-3333-4333-8333-333333333333',name:args.p_name,description:args.p_description,can_manage:true,room_count:0};window.__campaigns.push(chosen);
          }
          if(args.p_operation==='update'){
            chosen=window.__campaigns.find(c=>c.id===args.p_campaign);chosen.name=args.p_name;chosen.description=args.p_description;
          }
          return {data:{is_mj:window.__mj,campaigns:window.__campaigns.map(c=>({...c,can_manage:window.__mj})),...(chosen?{campaign:chosen}:{})},error:null};
        },channel(){return {on(){return this;},subscribe(){return this;},unsubscribe(){}};}};
    });
    await page.goto(base+'/index.html?room=4SSU');await page.waitForFunction(()=>window.__ready);
    assert.equal(await page.locator('#room-campaign-name').textContent(),'Campagne : Valombre');
    assert.equal(await page.locator('#room-campaign-id').textContent(),'11111111-1111-4111-8111-111111111111');
    await page.getByRole('button',{name:'Nouvelle room',exact:true}).click();
    await page.locator('#room-create-dialog').waitFor({state:'visible'});
    await page.locator('#room-campaign-select').selectOption('');
    await page.getByRole('button',{name:'Créer la room',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.name==='df_create_session_room').length),0);
    await page.locator('#room-campaign-select').selectOption('22222222-2222-4222-8222-222222222222');
    await page.getByRole('button',{name:'Créer la room',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('room-campaign-name').textContent==='Campagne : Aurore');
    assert.equal(await page.evaluate(()=>window.__calls.find(c=>c.name==='df_create_session_room').args.p_source),null);
    await page.getByRole('button',{name:'Campagnes MJ',exact:true}).click();
    await page.locator('#campaign-editor-select').selectOption('');
    await page.locator('#campaign-name-input').fill('Crépuscule');
    await page.locator('#campaign-description-input').fill('Une aventure distincte de Valombre');
    await page.getByRole('button',{name:'Créer la campagne',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('campaign-editor-status').textContent.includes('Campagne créée'));
    assert.equal(await page.locator('#campaign-editor-select').inputValue(),'33333333-3333-4333-8333-333333333333');
    await page.locator('#campaign-name-input').fill('Crépuscule II');
    await page.getByRole('button',{name:'Enregistrer les modifications'}).click();
    await page.waitForFunction(()=>window.__calls.some(c=>c.args.p_operation==='update'));
    assert.equal(await page.evaluate(()=>window.__campaigns[2].name),'Crépuscule II');
    await page.setViewportSize({width:390,height:844});
    assert(await page.locator('#campaign-manager-dialog').evaluate(el=>el.getBoundingClientRect().width<=window.innerWidth));
    const screenshot=path.join(os.tmpdir(),'diceforge-campaign-20261007','campaign-manager-mobile.png');
    fs.mkdirSync(path.dirname(screenshot),{recursive:true});await page.screenshot({path:screenshot});
    await page.getByRole('button',{name:'Fermer',exact:true}).click();
    await page.evaluate(async()=>{window.__mj=false;await window.refreshCampaigns();});
    assert.equal(await page.locator('#campaign-manager-btn').isVisible(),false);
    assert.equal(await page.locator('#new-session-btn').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('PASS campaign browser: required form, explicit campaign switch, create/edit, UUID, mobile layout and player controls.');
    console.log('Screenshot:',screenshot);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
