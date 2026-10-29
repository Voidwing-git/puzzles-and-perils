import {lockArt} from './lock-art.ts';
import {lockDifficulties} from '../core/lockpick.ts';
import type {PublicPuzzle} from '../core/state.ts';

export function mountLockView(root:HTMLElement,request:(angle:number,strain:boolean)=>Promise<boolean>,give:()=>void){
  root.innerHTML=`<div class="lock-heading"><span class="eyebrow">Lock picking</span><span class="lock-difficulty"></span></div>
    <div class="lock-surface" tabindex="0" role="group" aria-label="Lock face. Drag the pick to adjust its angle.">${lockArt()}</div>
    <div class="lock-inputs"><label>Pick angle<input class="lock-angle" type="range" min="-90" max="90" step="1" value="0" aria-label="Pick angle"/></label>
    <button class="lock-torque primary-button" type="button">Hold to turn</button></div>
    <p class="lock-help">Drag the pick or use ← →. Hold Space or Turn to test it. Release when it binds.</p>
    <div class="lock-condition"><label>Pick condition <meter min="0" max="100" value="100"></meter></label><button class="lock-give secondary-button" type="button" hidden>Give another pick</button></div>
    <p class="lock-status" role="status" aria-live="polite"></p>`;
  const el=<T extends HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
  const surface=el('.lock-surface'),slider=el<HTMLInputElement>('.lock-angle'),torque=el<HTMLButtonElement>('.lock-torque'),status=el('.lock-status');
  let state:PublicPuzzle|undefined,enabled=false,pending=false,holding=false,angle=0,sequence=0,disposed=false,lastRevision=-1,puzzleId='',externalBusy=false,reported='';
  function draw(){root.style.setProperty('--pick-angle',angle+'deg');root.style.setProperty('--lock-turn',(state?.lockpick?.opened?90:holding?state?.lockpick?.turn??0:0)+'deg');root.classList.toggle('is-binding',holding&&!!state?.lockpick&&state.lockpick.turn<90&&state.lockpick.turn>0);slider.value=String(angle);slider.disabled=!enabled||pending||holding||externalBusy;torque.disabled=!enabled||(!holding&&(externalBusy||pending));}
  function release(){holding=false;sequence++;draw();if(state?.lockpick&&!state.lockpick.opened&&!state.paused&&state.lockpick.pickHealth>0&&!reported&&enabled)status.textContent='Find the angle where the cylinder turns freely.';}
  function setAngle(value:number){if(!enabled||pending||holding)return;angle=Math.max(-90,Math.min(90,Math.round(value)));draw();}
  async function start(){
    if(!enabled||pending||holding||!state?.lockpick)return;
    reported='';holding=true;const token=++sequence,pickedAngle=angle;draw();
    try{
      pending=true;const accepted=await request(pickedAngle,false);pending=false;
      if(!accepted){release();return;}
      while(!disposed&&holding&&sequence===token&&state.lockpick&&!state.lockpick.opened&&state.lockpick.pickHealth>0){
        await new Promise(resolve=>setTimeout(resolve,650));
        if(!holding||sequence!==token||!enabled)break;
        pending=true;const pushed=await request(pickedAngle,true);pending=false;
        if(!pushed)break;
      }
    }finally{pending=false;if(sequence===token)release();else draw();}
  }
  slider.addEventListener('input',()=>setAngle(Number(slider.value)));
  let dragging=false;
  const point=(event:PointerEvent)=>{const box=surface.getBoundingClientRect();setAngle(Math.atan2(event.clientX-box.left-box.width/2,box.top+box.height/2-event.clientY)*180/Math.PI);};
  surface.addEventListener('pointerdown',event=>{if(event.button!==0||!enabled)return;event.preventDefault();dragging=true;surface.setPointerCapture(event.pointerId);point(event);surface.focus();});
  surface.addEventListener('pointermove',event=>{if(dragging)point(event);});
  surface.addEventListener('pointerup',()=>{dragging=false;});surface.addEventListener('pointercancel',()=>{dragging=false;release();});
  torque.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();torque.setPointerCapture(event.pointerId);void start();});
  torque.addEventListener('pointerup',release);torque.addEventListener('pointercancel',release);torque.addEventListener('lostpointercapture',release);
  const keydown=(event:KeyboardEvent)=>{
    if(root.hidden||root.closest('[hidden]')||!state?.lockpick||event.ctrlKey||event.altKey||event.metaKey)return;
    const target=event.target as Element|null;
    if(target?.closest('input,textarea,select,[contenteditable],summary,[role="dialog"]'))return;
    if(target?.closest('button')&&target!==torque)return;
    if(event.code==='Space'){event.preventDefault();if(!event.repeat)void start();}
    else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setAngle(angle+(event.key==='ArrowLeft'?-2:2));}
  };
  const keyup=(event:KeyboardEvent)=>{if(event.code==='Space')release();};
  const visibility=()=>{if(document.hidden)release();};
  document.addEventListener('keydown',keydown);document.addEventListener('keyup',keyup);window.addEventListener('blur',release);document.addEventListener('visibilitychange',visibility);
  el<HTMLButtonElement>('.lock-give').onclick=give;
  return{
    update(next:PublicPuzzle,canPlay:boolean,gm:boolean,busy:boolean){
      state=next;externalBusy=busy;const lock=next.lockpick;root.hidden=next.puzzleType!=='lockpick';if(!lock||root.hidden){release();return;}
      if(next.puzzleId!==puzzleId){release();angle=0;puzzleId=next.puzzleId;lastRevision=-1;reported='';}
      enabled=canPlay&&!next.paused&&!lock.opened&&lock.pickHealth>0;
      if(!holding&&next.revision!==lastRevision)angle=lock.angle;
      if(next.paused||lock.opened||lock.pickHealth===0)release();
      const difficulty=lockDifficulties[lock.difficulty];el('.lock-difficulty').textContent=`${difficulty.name} · DC ${difficulty.dc}`;
      slider.disabled=!enabled||pending||holding||busy;torque.disabled=!enabled||(!holding&&busy);
      el<HTMLMeterElement>('meter').value=lock.pickHealth;
      const button=el<HTMLButtonElement>('.lock-give');button.hidden=!gm||lock.pickHealth!==0||lock.opened;button.disabled=busy||!!next.paused;
      root.classList.toggle('pick-broken',lock.pickHealth===0);root.classList.toggle('lock-open',lock.opened);
      status.textContent=lock.opened?'':next.paused?'The GM has paused the puzzle.':lock.pickHealth===0?'The pick broke. Waiting for the GM to give another pick.':reported||(!canPlay&&!busy?'Wait for your turn or for the GM to reconnect.':holding?(lock.turn>0&&lock.turn<90?'Binding — release and adjust the pick.':'Testing the lock…'):'Find the angle where the cylinder turns freely.');
      if(next.revision!==lastRevision&&!holding&&lock.turn>0&&!lock.opened&&!matchMedia('(prefers-reduced-motion: reduce)').matches){el('.lock-cylinder').animate([{transform:'rotate(0deg)'},{transform:`rotate(${lock.turn}deg)`},{transform:'rotate(0deg)'}],{duration:750});}
      lastRevision=next.revision;draw();
    },
    report(message:string){reported=message;status.textContent=message;},
    dispose(){disposed=true;release();document.removeEventListener('keydown',keydown);document.removeEventListener('keyup',keyup);window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',visibility);},
  };
}
