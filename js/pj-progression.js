import { totalResultHtml } from './dice-stage.js?v=20261003-xp-frame';
import * as D3D from './dice3d-box.js?v=20260725-low-latency-obs';
import { spellScore } from './pj-magic.js?v=20261003-learning';

export function progressionTargets(sheet) {
 const session=sheet?.progression?.session;
 const attempts=session?.attempts || [];
 return ['skill','spell'].flatMap(resource=>(sheet?.[resource==='skill'?'skills':'spells'] || []).flatMap(row=>{
  if (!row.id) return [];
  const attempt=attempts.find(a=>a.resource===resource && a.resource_id===row.id);
  const score=resource==='skill' ? Number(row.score) : spellScore(sheet,row);
  return row.checked || attempt ? [{resource,id:row.id,name:row.name || row.id,score,attempt}] : [];
 }));
}

function animationsEnabled() {
 try { return window.parent.document.getElementById('setting-anim')?.getAttribute('aria-pressed') !== 'false'; }
 catch { return true; }
}

export function mountProgression({panel,client,getSheet,getRoom,save,apply,confirm,lock,getSaveError=()=>'',dice=D3D,animate=animationsEnabled}) {
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let busy=false, message='', lastReceipt=null, lastIdentity=null, rolling=false, targetName='';
 // Keep the DiceBox canvas alive when the surrounding controls are refreshed.
 const stage=document.createElement('div');
 stage.className='dice-stage';
 stage.innerHTML='<div id="dice-3d-container" class="dice-3d-container"></div><div class="result-area" aria-live="polite"></div>';
 const resultArea=stage.querySelector('.result-area');
 const key=()=>{const s=getSheet(),r=getRoom();return `diceforge:xp:${r?.userId}:${s?.state_id}:${r?.code}`;};
 const pending=()=>{try{return JSON.parse(localStorage.getItem(key()));}catch{return null;}};
 function render() {
  const identity=key();
  if(lastIdentity!==identity){lastReceipt=null;targetName='';message='';lastIdentity=identity;}
  const sheet=getSheet(), room=getRoom(), session=sheet?.progression?.session;
  const usable=sheet?.lifecycle?.status!=='dead' && sheet?.creation?.phase==='play' && session?.room_code===room?.code;
  const targets=progressionTargets(sheet);
  const retry=pending();
  panel.innerHTML=`<div class="dice-layout"><div class="dice-controls"><section class="pj-section"><h2>Progression de ${escape(sheet?.fields?.name || 'votre personnage')}</h2>
   <p>Une réussite utile donne une coche. Chaque cible cochée dispose d’un D100 par session : dépassez son score pour déverrouiller la dépense. 1 XP donne +1 %, jusqu’à 100 %.</p>
   <p class="pj-xp-pool">${usable ? (session.closed_at ? `Session ${escape(room.code)} clôturée · ${session.lost} XP non dépensés perdus` : `Session ${escape(room.code)} · <strong>${session.remaining} / ${session.pool} XP disponibles</strong>`) : 'Rejoignez une partie avec une fiche validée pour progresser.'}</p>
   <p role="status" aria-live="polite">${escape(message)}</p>
   ${retry ? '<button type="button" class="room-btn" data-xp-retry>Récupérer le résultat de la dernière action</button>' : ''}
   ${usable ? `<div class="pj-table-wrap"><table class="pj-table"><thead><tr><th>Cible cochée</th><th>Score</th><th>Tentative</th><th>XP</th></tr></thead><tbody>${targets.map(t=>{
    const available=!busy && !retry && !session.closed_at;
    const maximum=Math.max(0,Math.min(session.remaining,100-t.score));
    return `<tr><td>${escape(t.name)}<small>${t.resource==='spell'?'Sort':'Compétence'}</small></td><td>${t.score} %</td><td>${t.attempt ? `D100 ${t.attempt.roll} / ${t.attempt.score} % · ${t.attempt.unlocked?'Déverrouillé':'Échoué, tentative consommée'}` : t.score>=100 ? 'Plafond atteint' : `<button type="button" class="room-btn" data-xp-unlock="${escape(t.id)}" data-resource="${t.resource}" ${available?'':'disabled'}>Déverrouiller</button>`}</td><td>${t.attempt?.unlocked && maximum>0 ? `<input type="number" min="1" max="${maximum}" step="1" value="1" aria-label="XP pour ${escape(t.name)}" ${available?'':'disabled'}><button type="button" class="room-btn" data-xp-spend="${escape(t.id)}" data-resource="${t.resource}" ${available?'':'disabled'}>Attribuer</button>` : '—'}</td></tr>`;
   }).join('')}</tbody></table></div>${targets.length?'':'<p>Aucune compétence ni sort coché pour cette session.</p>'}
   <button type="button" class="room-leave" data-xp-refresh ${busy || retry?'disabled':''}>Actualiser</button>
   <button type="button" class="room-leave" data-xp-close ${busy || retry || session.closed_at?'disabled':''}>Clôturer la session (${session.remaining} XP seront perdus)</button>` : ''}</section></div><div class="dice-output"${usable?'':' hidden'}><div data-xp-stage></div></div></div>`;
  panel.querySelector('[data-xp-retry]')?.toggleAttribute('disabled',busy);
  panel.querySelector('[data-xp-stage]').replaceWith(stage);
  resultArea.style.visibility=rolling?'hidden':'';
  if(rolling) resultArea.innerHTML='';
  else if(lastReceipt) resultArea.innerHTML=totalResultHtml({
   label:`${targetName} · Déverrouillage`,
   value:lastReceipt.roll===100?'00':String(lastReceipt.roll).padStart(2,'0'),
   messageHtml:`<div class="test-msg ${lastReceipt.unlocked?'success':'failure'}">${lastReceipt.unlocked?'Déverrouillé':'Tentative échouée'}</div>`,
   detailsHtml:`<div class="total-brkd">D100 ${lastReceipt.roll} / score ${lastReceipt.score} % · Il faut dépasser ${lastReceipt.score}.</div>`
  });
  else resultArea.innerHTML='';
 }
 async function revealRoll(receipt,args) {
  if(!receipt || !Number.isInteger(receipt.roll) || receipt.roll<1 || receipt.roll>100) throw new Error('Résultat de jet incomplet. Récupérez le résultat enregistré.');
  targetName=progressionTargets(getSheet()).find(t=>t.resource===args.p_resource && t.id===args.p_id)?.name || args.p_id;
  if(animate()) {
   rolling=true;message='Lancer de dés…';render();
   stage.scrollIntoView?.({behavior:'smooth',block:'center'});
   try {await new Promise(resolve=>dice.roll([{type:100,rolls:[{val:null,finalVal:receipt.roll,state:'rolling'}]}],1800,resolve));}
   finally {rolling=false;dice.hide();}
  }
  lastReceipt=receipt;
 }
 async function execute(operation,resource=null,id=null,amount=null,resume=false) {
  if(busy || (pending() && !resume))return;
  const room=getRoom(), initial=getSheet();
  if(!client || !room || !initial?.state_id)return;
  if(operation==='close' && !resume && !await confirm(`Clôturer cette session ? Les ${initial.progression.session.remaining} XP restants seront définitivement perdus.`))return;
  busy=true;lock(true);message='Enregistrement en cours…';render();
  let args=resume ? pending() : null;
  const storageKey=key();
  try {
   if(!args) {
    const saved=operation==='status' ? {sheet_data:initial} : await save();
    if(!saved?.sheet_data?.state_id || !Number.isInteger(saved.sheet_data.revision))throw new Error(`${getSaveError() || 'La sauvegarde de la fiche n’a pas pu être confirmée.'} Aucune tentative n’a été consommée.`);
    args={p_state:saved.sheet_data.state_id,p_room:room.code,p_operation:operation,p_resource:resource,p_id:id,p_amount:amount,p_request:crypto.randomUUID(),p_expected_revision:saved.sheet_data.revision};
    localStorage.setItem(storageKey,JSON.stringify(args));
   }
   const {data,error}=await client.rpc('df_progression',args);
   if(error)throw error;
   if(!data?.sheet_data)throw new Error('Réponse inconnue. Récupérez le résultat pour vérifier l’enregistrement.');
   if(key()!==storageKey) {localStorage.removeItem(storageKey);return;}
   if(args.p_operation==='unlock')await revealRoll(data.receipt,args);
   if(key()!==storageKey) {localStorage.removeItem(storageKey);lastReceipt=null;return;}
   apply(data.sheet_data);
   localStorage.removeItem(storageKey);
   message=args.p_operation==='spend' ? `${args.p_amount} XP attribués.` : args.p_operation==='close' ? 'Session clôturée.' : args.p_operation==='status' ? 'Progression actualisée.' : 'Jet enregistré et publié dans le salon.';
   if(args.p_operation==='spend') {
    // Refresh Markdown from canonical data. Failure here cannot undo the confirmed XP transaction.
    try {if(!await save())message+=' Points enregistrés ; export à actualiser avec « Sauvegarder en ligne ».';}
    catch {message+=' Points enregistrés ; export à actualiser dès le retour de la connexion.';}
   }
  } catch(error) {
   // A definitive PostgreSQL rejection consumes nothing. An uncertain network response must reuse its UUID.
   if(error.code && /^([0-9]{2}|P0)/.test(error.code))localStorage.removeItem(storageKey);
   message=error.message || 'Connexion interrompue. Récupérez le résultat avant de recommencer.';
  } finally {busy=false;lock(false);render();}
 }
 panel.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-xp-retry'))return execute(null,null,null,null,true);
  if(b.hasAttribute('data-xp-refresh'))return execute('status');
  if(b.hasAttribute('data-xp-close'))return execute('close');
  if(b.hasAttribute('data-xp-unlock'))return execute('unlock',b.dataset.resource,b.dataset.xpUnlock);
  if(b.hasAttribute('data-xp-spend')) {
   const input=b.closest('td').querySelector('input');
   if(!input.reportValidity())return;
   return execute('spend',b.dataset.resource,b.dataset.xpSpend,Number(input.value));
  }
 });
 return {render};
}
