const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
  const helpers = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('js/sheet-validation.js','utf8')).toString('base64'));
  const {normalizeGenre} = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('js/character-identity.js','utf8')).toString('base64'));
  for (const [value, expected] of [['M','Masculin'],['F','Féminin'],['N','Neutre'],['Masculin','Masculin'],['Féminin','Féminin'],['Neutre','Neutre'],['autre',''],['','']]) assert.equal(normalizeGenre(value),expected);
  const source=fs.readFileSync('js/pj-sheet.js','utf8');
  const skill={id:'skill.estimation',base:15,points:25,score:40,checked:false};
  const hidden={id:'skill.artillerie',base:1,points:5,score:6,checked:true,notes:'Preserved hidden skill'};
  const sheet={state_id:'state',revision:2,creation:{phase:'play'},fields:{profession:'Sorcier',genre:'Masculin',sex:'M'},stats:{intelligence:16},skills:[skill,{},hidden]};
  assert(helpers.isCreationLocked(sheet));assert(helpers.isCreationLocked({creation:{phase:'legacy_review'}}));assert(!helpers.isCreationLocked({creation:{phase:'draft'}}));
  const proposed={...skill,base:30,points:0,score:30,checked:true};
  assert.deepEqual(helpers.skillSaveValues(sheet,0,proposed),{...skill,checked:true});
  assert.equal(helpers.skillSaveValues({creation:{phase:'draft'}},0,proposed),proposed);
  assert.deepEqual(helpers.skillSaveValues(sheet,1,proposed),{},'Newly visible skills are not silently added to inherited allocations');
  const fields=[{dataset:{field:'profession'},value:'Sorcier'},{dataset:{field:'genre'},value:'Féminin'}];
  const inputs={ '[data-stat="intelligence"]':{value:'16'}, '[data-skill-base="0"]':{value:'999'},
    '[data-skill-points="0"]':{value:'0'}, '[data-skill-final="0"]':{textContent:'999'}, '[data-skill-check="0"]':{checked:true} };
  const context={...helpers,normalizeGenre,loadedSheetData:sheet,syncSpellSlotsFromForm(){},structuredClone,
    form:{querySelectorAll:()=>fields,querySelector:selector=>inputs[selector]},
    SKILLS:[[],[],[]],ACTIVE_SKILLS:[{index:0}],STATS:[['INT','intelligence']],SKILL_IDS:['skill.estimation',null,'skill.artillerie'],SPELL_IDS:{},
    spellSlots:[],weaponsBody:{rows:[]}};
  vm.createContext(context);
  const body=source.slice(source.indexOf('function collectData()'),source.indexOf('function applyData('));
  const result=vm.runInContext(body+'\ncollectData();',context);
  assert.deepEqual(result.skills[0],{...skill,checked:true});
  assert.deepEqual(result.skills[2],hidden,'A full locked save must retain numeric rows absent from the UI');
  assert.equal(result.state_id,'state');assert.equal(result.revision,2);
  assert.equal(result.fields.genre,'Masculin','Saving ignores an altered readonly input and keeps the creation value');
  assert.equal(Object.hasOwn(result.fields,'sex'),false,'Legacy sex is replaced by the canonical genre');
  const names=['Dague','Arc court','Rapière'];
  const types=['mixed','distance','contact'];
  const rows=names.map((name,index)=>{
    const controls={name:{value:name},attackType:{value:''},contactScore:{value:''},distanceScore:{value:''}};
    const label={textContent:''};
    return {controls,label,querySelector(selector){return selector==='[data-weapon-class]' ? label : controls[selector.match(/data-weapon="([^"]+)"/)[1]];}};
  });
  const finals={31:{textContent:'42'},32:{textContent:'37'}};
  const weaponContext={ACTIVE_SKILLS:[{skill:['Arme de mêlée'],index:31},{skill:['Arme de jet'],index:32}],
    form:{querySelector:selector=>finals[selector.match(/"(\d+)"/)[1]]},weaponsBody:{rows},
    weaponDefinition:name=>({attackType:types[names.indexOf(name)]})};
  vm.createContext(weaponContext);
  vm.runInContext(source.slice(source.indexOf('function skillFinalScore('),source.indexOf('function applyWeaponSelection('))+'\nsyncWeaponScores();',weaponContext);
  assert.equal(rows[0].controls.contactScore.value,'42');assert.equal(rows[0].controls.distanceScore.value,'37','Mixed weapon copies the ranged skill');
  assert.equal(rows[1].controls.distanceScore.value,'37');assert.equal(rows[1].controls.contactScore.placeholder,'—');
  assert.equal(rows[2].controls.contactScore.value,'42');assert.equal(rows[2].controls.distanceScore.value,'');assert.equal(rows[2].controls.distanceScore.placeholder,'—','Contact-only weapon displays an explicit unavailable mode, without exporting a false zero');
  finals[32].textContent='47';vm.runInContext('syncWeaponScores();',weaponContext);
  assert.equal(rows[0].controls.distanceScore.value,'47');assert.equal(rows[1].controls.distanceScore.value,'47','Changing ranged skill updates both applicable weapons');
  finals[32].textContent='0';vm.runInContext('syncWeaponScores();',weaponContext);
  assert.equal(rows[1].controls.distanceScore.value,'0');assert.equal(rows[1].controls.distanceScore.placeholder,'','An applicable 0% score must remain distinct from an unavailable mode');
  console.log('PASS weapon scores: contact, mixed and ranged weapons, live skill updates, zero score and explicit unavailable modes.');
  console.log('PASS creation form: frozen numerical values, editable checkboxes, hidden records, draft editing and metadata preservation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
