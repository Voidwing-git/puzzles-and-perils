import {createLock,lockDifficulties,LOCK_OPEN_MS,LOCK_TICK_MS} from '../core/lockpick.ts';
import type {LockDifficulty,PrivatePreparation} from '../core/state.ts';
import {savePrivate,readValidatedPrivate} from '../core/private-store.ts';
import {lockArt} from './lock-art.ts';

export function mountLockAuthoring(root:HTMLElement,finalize:(draft:PrivatePreparation)=>Promise<void>,scope:string,initial?:PrivatePreparation){
  root.innerHTML=`<div class="setup-heading"><p class="eyebrow">GM setup · Lock picking</p><h1>${initial?'Edit current lock':'Make a lock'}</h1></div>
    <div class="setup-layout"><section class="panel setup-settings" aria-label="Lock settings"><label>Lock name<input id="lock-title" maxlength="128"/></label>
    <fieldset class="lock-difficulties"><legend>Difficulty</legend>${Object.entries(lockDifficulties).map(([key,value])=>`<label><input type="radio" name="lock-difficulty" value="${key}"/><span>${value.name}</span><strong>DC ${value.dc}</strong></label>`).join('')}</fieldset>
    <p class="quiet">Higher difficulties narrow the zone and break picks faster when the lock binds. DC tags are reference labels for your table.</p><p id="lock-timing" class="quiet"></p>
    <label class="mode-toggle"><input id="lock-free" type="checkbox" checked/> Free play (turns off)</label>
    <p class="quiet">Starts with one pick. If it breaks, play waits until you give another pick.</p>
    <button id="randomize-lock" class="secondary-button">New opening angle</button><button id="publish-lock" class="primary-button">${initial?'Save changes':'Finalize lock'}</button><p id="lock-draft-status" role="status"></p></section>
    <section class="setup-preview lock-preview" aria-label="Lock preview"><div class="lock-heading"><h2>Lock preview</h2><span id="lock-preview-difficulty"></span></div><div class="lock-surface"></div><div class="lock-zone-guide"><p id="lock-zone-label"></p><div id="lock-zone-bar" role="img"><span class="lock-zone-range"></span><span class="lock-zone-marker"></span></div><div class="lock-zone-ticks"><span>−90°</span><span>0°</span><span>+90°</span></div><small>GM only · highlighted slice and bar show the safe pick zone.</small></div></section></div>`;
  const el=<T extends HTMLElement>(id:string)=>root.querySelector<T>('#'+id)!;
  let draft=initial?structuredClone(initial):createLock('novice',crypto.randomUUID()),busy=false;
  if(!initial){try{const saved=readValidatedPrivate(scope+':lock-working-draft');if(saved?.state.puzzleType==='lockpick')draft=createLock(saved.state.lockpick!.difficulty,crypto.randomUUID());}catch{/* A fresh lock remains available when an older draft is damaged. */}}
  function persist(){try{savePrivate(scope+':lock-working-draft',draft);el('lock-draft-status').textContent='Saved privately. Finalize to update the players’ puzzle.';el<HTMLButtonElement>('publish-lock').disabled=false;}catch(error){el('lock-draft-status').textContent=(error as Error).message;el<HTMLButtonElement>('publish-lock').disabled=true;}}
  function refresh(){
    const difficulty=lockDifficulties[draft.state.lockpick!.difficulty],angle=draft.lockSecret!.sweetSpot;
    const low=Math.max(-90,angle-difficulty.tolerance),high=Math.min(90,angle+difficulty.tolerance),degrees=(n:number)=>`${n>0?'+':''}${n}°`;
    el('lock-preview-difficulty').textContent=`${difficulty.name} · DC ${difficulty.dc}`;
    root.querySelector<HTMLInputElement>(`[name="lock-difficulty"][value="${draft.state.lockpick!.difficulty}"]`)!.checked=true;el<HTMLInputElement>('lock-title').value=draft.state.title;el<HTMLInputElement>('lock-free').checked=draft.state.mode==='free';
    root.querySelector('.lock-surface')!.innerHTML=lockArt({angle,tolerance:difficulty.tolerance});
    root.querySelector<HTMLElement>('.lock-preview')!.style.setProperty('--pick-angle',angle+'deg');
    const description=`Opening angle ${degrees(angle)} · Safe zone ${degrees(low)} to ${degrees(high)}`;
    el('lock-zone-label').textContent=description;el('lock-zone-bar').setAttribute('aria-label',description);
    el('lock-zone-bar').style.setProperty('--zone-start',((low+90)/180*100)+'%');el('lock-zone-bar').style.setProperty('--zone-width',((high-low)/180*100)+'%');el('lock-zone-bar').style.setProperty('--zone-center',((angle+90)/180*100)+'%');
    el('lock-timing').textContent=`Steady opening hold: about ${LOCK_OPEN_MS/1000}s. A fresh pick withstands about ${Math.ceil(100/difficulty.damage)*LOCK_TICK_MS/1000}s of binding.`;
  }
  function reset(difficulty=draft.state.lockpick!.difficulty){const previous=draft;draft=createLock(difficulty,crypto.randomUUID());draft.state.title=previous.state.title;draft.state.mode=previous.state.mode;draft.state.participants=previous.state.participants;draft.state.rosterCustomized=previous.state.rosterCustomized;persist();refresh();}
  for(const input of root.querySelectorAll<HTMLInputElement>('[name="lock-difficulty"]'))input.onchange=()=>{if(!busy)reset(input.value as LockDifficulty);};
  el<HTMLInputElement>('lock-title').oninput=()=>{draft.state.title=el<HTMLInputElement>('lock-title').value.trim()||'The warded lock';persist();};
  el<HTMLInputElement>('lock-free').onchange=()=>{draft.state.mode=el<HTMLInputElement>('lock-free').checked?'free':'turns';persist();};
  el('randomize-lock').onclick=()=>{if(!busy)reset();};
  el('publish-lock').onclick=async()=>{if(busy)return;busy=true;for(const control of root.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button'))control.disabled=true;try{await finalize(structuredClone(draft));}catch(error){el('lock-draft-status').textContent=(error as Error).message;}finally{busy=false;for(const control of root.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button'))control.disabled=false;}};
  refresh();persist();return()=>{};
}
