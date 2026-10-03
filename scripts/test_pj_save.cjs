const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync('js/pj-sheet.js','utf8');
const handler=source.slice(source.indexOf('async function saveSheetToSupabase()'),source.indexOf('function updateCreationControls()'));
async function save(response) {
 const calls=[],messages=[],button={disabled:false},data={state_id:'state',revision:2,stats:{intelligence:12},fields:{name:'Test'}};
 const context={structuredClone,Date,STORAGE_KEY:'draft',saveTimer:null,loadedSheetData:data,
  currentRoom:()=>({userId:'owner',player:'Player',code:'TEST'}),fieldValue:()=> 'Test',creationBudgetErrors:()=>[],
  characteristicErrors:()=>[],collectData:()=>data,normalizeCharacteristics:s=>s,toMarkdown:()=> '# Test',
  setStatus:m=>messages.push(m),supabaseErrorMessage:e=>e.message,renderSpellRows(){},updateCreationControls(){},updateDerived(){},clearTimeout(){},
  document:{getElementById:()=>button},form:{querySelector:()=>null},localStorage:{setItem(){},removeItem(){}},
  supabase:{from(){return {upsert(){return {select(columns){calls.push(columns);return Promise.resolve(response);}};}};}}
 };
 vm.createContext(context);const row=await vm.runInContext(handler+'\nsaveSheetToSupabase()',context);
 assert.equal(button.disabled,false);return {row,calls,messages,context};
}
(async()=>{
 const row={id:'state',revision:8,sheet_data:{state_id:'state',revision:8,stats:{intelligence:12}}};
 const returned=await save({data:[row],error:null});assert.equal(returned.row,row);assert.deepEqual(returned.calls,['*']);
 assert.equal(returned.context.loadedSheetData.revision,8);
 assert.equal((await save({data:row,error:null})).row,row,'Support a single canonical row too');
 const absent=await save({data:null,error:null});assert.equal(absent.row,undefined);assert(absent.messages.at(-1).includes('non confirmée'));
 const refused=await save({data:null,error:{message:'Fiche verrouillée'}});assert.equal(refused.row,undefined);assert(refused.messages.at(-1).includes('Fiche verrouillée'));
 console.log('PASS sheet save: returned canonical row and fresh revision requested, empty response and server refusal preserved.');
})().catch(error=>{console.error(error);process.exitCode=1;});
