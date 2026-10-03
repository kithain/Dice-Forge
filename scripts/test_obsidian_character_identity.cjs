const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const filename=process.argv[2];
if(!filename)throw Error('Provide the Obsidian plugin main.js path.');
const source=fs.readFileSync(filename,'utf8');
const context={};vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function normalized('),source.indexOf('function sheetData(')),context);
const rows=[{state_id:'111-aaa',character_id:'p1',player_name:'Lisa',character_name:'Même nom'},
 {state_id:'222-bbb',character_id:'p2',player_name:'Lisa',character_name:'Même nom'}];
assert.equal(context.latestSheetsByPlayer(rows).size,2,'Two PJ of one player remain distinct');
assert.notEqual(context.permanentSheetKey(rows[0]),context.permanentSheetKey(rows[1]));
assert.notEqual(context.sheetFileName(rows[0],rows),context.sheetFileName(rows[1],rows),'Equal names never overwrite each other');
assert.equal(context.sheetFileName({character_name:'Gram'},[{character_name:'Gram'}]),'gram.md','Existing unique names retain their vault path');
assert.throws(()=>context.sheetFileName({character_name:'Same'},[{character_name:'Same'},{character_name:'Same'}]),/identité permanente/);
assert.equal((source.match(/new Map\(sheetRows.map\(row => \[permanentSheetKey\(row\), row\]\)\)/g)||[]).length,2,'Both MJ dashboards use permanent identities');
console.log('PASS Obsidian: multiple PJ per player, permanent identity, equal-name file protection and existing unique paths.');
