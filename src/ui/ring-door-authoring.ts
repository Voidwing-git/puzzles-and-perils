import {createRingDoor,ringNames,ringSymbols,RING_STEPS,type RingPositions} from '../core/ring-door.ts';
import type {PrivatePreparation} from '../core/state.ts';
import {savePrivate,readValidatedPrivate} from '../core/private-store.ts';
import {ringDoorArt} from './ring-door-art.ts';
import './ring-door.css';

export function mountRingDoorAuthoring(root:HTMLElement,finalize:(draft:PrivatePreparation)=>Promise<void>,scope:string,initial?:PrivatePreparation){
  root.innerHTML=`<div class="setup-heading"><p class="eyebrow">GM setup · Ring door</p><h1>${initial?'Edit current ring door':'Make a ring door'}</h1></div>
    <div class="setup-layout"><section class="panel setup-settings" aria-label="Ring door settings">
    <label>Door name<input id="ring-door-title" maxlength="128"/></label>
    <fieldset class="ring-secret-controls"><legend>Opening combination · GM only</legend>${ringNames.map((name,i)=>`<label>${name} ring<select id="ring-target-${i}" aria-label="${name} ring opening symbol">${ringSymbols.map((symbol,index)=>`<option value="${index}">${symbol}</option>`).join('')}</select></label>`).join('')}</fieldset>
    <p class="quiet">The door opens when these three symbols line up at the top. Share the clue elsewhere in your adventure.</p>
    <label class="mode-toggle"><input id="ring-door-free" type="checkbox" checked/> Free play (turns off)</label>
    <button id="shuffle-rings" class="secondary-button">Shuffle starting rings</button><button id="publish-ring-door" class="primary-button">${initial?'Save changes':'Finalize ring door'}</button><p id="ring-door-draft-status" role="status"></p>
    </section><section class="setup-preview ring-door-preview" aria-label="Ring door preview"><div class="ring-door-preview-heading"><h2>Door preview</h2></div><div class="ring-door-surface">${ringDoorArt()}</div><p class="ring-door-preview-note">Players see the rings, not the opening combination.</p></section></div>`;
  const el=<T extends HTMLElement>(id:string)=>root.querySelector<T>('#'+id)!;
  let draft=initial?structuredClone(initial):createRingDoor(crypto.randomUUID()),busy=false,saveOkay=true;
  if(!initial){try{const saved=readValidatedPrivate(scope+':ring-working-draft');if(saved?.state.puzzleType==='ring-door'&&saved.ringSecret)draft=createRingDoor(crypto.randomUUID(),saved.ringSecret.targets);}catch{/* A new valid draft remains available. */}}
  function persist(){
    try{savePrivate(scope+':ring-working-draft',draft);saveOkay=true;el('ring-door-draft-status').textContent=initial?'Saved privately. Save changes to update the players’ door.':'Saved privately. Finalize to make the door available.';}
    catch(error){saveOkay=false;el('ring-door-draft-status').textContent=(error as Error).message;}
    el<HTMLButtonElement>('publish-ring-door').disabled=busy||!saveOkay;
  }
  function refresh(){
    el<HTMLInputElement>('ring-door-title').value=draft.state.title;el<HTMLInputElement>('ring-door-free').checked=draft.state.mode==='free';
    for(let i=0;i<3;i++){
      el<HTMLSelectElement>('ring-target-'+i).value=String(draft.ringSecret!.targets[i]);
      root.querySelector<SVGGElement>(`.door-ring[data-ring="${i}"]`)!.style.setProperty('--ring-angle',draft.state.ringDoor!.positions[i]*360/RING_STEPS+'deg');
    }
  }
  function rebuild(targets:RingPositions,shuffle:boolean){
    const old=draft;draft=createRingDoor(crypto.randomUUID(),targets,shuffle?undefined:old.state.ringDoor!.positions);
    draft.state.title=old.state.title;draft.state.mode=old.state.mode;draft.state.participants=structuredClone(old.state.participants);draft.state.rosterCustomized=old.state.rosterCustomized;
    draft.startingState=structuredClone(draft.state);persist();refresh();
  }
  for(let i=0;i<3;i++)el<HTMLSelectElement>('ring-target-'+i).onchange=()=>{
    if(busy)return;const targets=[...draft.ringSecret!.targets] as RingPositions;targets[i]=Number(el<HTMLSelectElement>('ring-target-'+i).value);rebuild(targets,false);
  };
  el<HTMLInputElement>('ring-door-title').oninput=()=>{if(busy)return;draft.state.title=el<HTMLInputElement>('ring-door-title').value.trim()||'The sealed ring door';persist();};
  el<HTMLInputElement>('ring-door-free').onchange=()=>{if(busy)return;draft.state.mode=el<HTMLInputElement>('ring-door-free').checked?'free':'turns';persist();};
  el('shuffle-rings').onclick=()=>{if(!busy)rebuild([...draft.ringSecret!.targets],true);};
  el('publish-ring-door').onclick=async()=>{
    if(busy||!saveOkay)return;busy=true;for(const control of root.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('input,button,select'))control.disabled=true;
    try{await finalize(structuredClone(draft));}catch(error){el('ring-door-draft-status').textContent=(error as Error).message;}
    finally{busy=false;for(const control of root.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('input,button,select'))control.disabled=false;el<HTMLButtonElement>('publish-ring-door').disabled=!saveOkay;}
  };
  refresh();persist();return()=>{};
}
