import {validateChallenge,type ChallengeState,type ChallengeAction} from '../core/challenges.ts';
import {reflectAxis,receiverAligned} from '../core/challenge-rules.ts';
import type {PublicPuzzle} from '../core/state.ts';
import {advancedArt,orbitRadius,receiverPlot} from './challenge-advanced-art.ts';
import './challenge-advanced.css';

export function mountAdvancedView(root:HTMLElement,request:(a:ChallengeAction)=>Promise<boolean>){
  root.innerHTML='<div class="challenge-heading"><strong class="challenge-progress"></strong><span class="challenge-timer" role="timer"></span></div><div class="challenge-surface"></div><div class="challenge-controls"></div><p class="challenge-help"></p><p class="challenge-feedback" role="status"></p>';
  const surface=root.querySelector<HTMLElement>('.challenge-surface')!,controls=root.querySelector<HTMLElement>('.challenge-controls')!,feedback=root.querySelector<HTMLElement>('.challenge-feedback')!,timer=root.querySelector<HTMLElement>('.challenge-timer')!,progress=root.querySelector<HTMLElement>('.challenge-progress')!;
  let state:ChallengeState|undefined,key='',revision=-1,play=false,busy=false,gm=false,disposed=false,sending=false,entered='',expiryPending=false,autoEnterAllowed=true,wasHidden=false;
  let phase=0,streamPosition=0,ring=0,held=false,heldAt=0,heldPhase=0,heldRing=0,direction=1,moving=false,boost=false,last=performance.now(),nextMove=0,nextCapture=0,raf=0;
  let mirrorX=50,mirrorY=50,editingIndex:number|undefined,knob:{input:HTMLInputElement;value:number;x:number;y:number}|undefined;
  const queue:{action:ChallengeAction;key:string;attempt:number}[]=[],rotations=new Map<number,{mod:number;angle:number}>();
  function allowed(){return !!state&&play&&!state.opened&&!state.failed;}
  async function pump(){if(sending||disposed||busy||!queue.length)return;sending=true;const item=queue.shift()!;try{if(item.key===key&&item.attempt===state?.attempt)await request(item.action);}finally{sending=false;if(queue.length)void pump();}}
  function send(action:ChallengeAction){if(!state||!allowed()&&!['enter','expire','retry'].includes(action.op))return;if(queue.length>32)return;queue.push({action,key,attempt:state.attempt!});void pump();}
  function stop(){held=false;heldAt=0;boost=false;moving=false;knob=undefined;}
  function positions(){if(!state)return;surface.querySelector('[data-sweep]')?.setAttribute('transform',`rotate(${phase} 300 210)`);
    if(state.kind==='orbit'){for(const g of surface.querySelectorAll<SVGElement>('[data-orbit]')){const r=Number(g.dataset.orbit),dir=state.rules!.reverse&&r%2?-1:1;g.setAttribute('transform',`rotate(${phase*dir} 300 210)`);}surface.querySelector('[data-orbit-gate]')?.setAttribute('transform',`translate(300 ${210-orbitRadius(state,ring)})`);}
    if(state.kind==='mirror'){const [x,y]=reflectAxis(state.target[0],mirrorX,mirrorY);surface.querySelector('[data-pointer]')?.setAttribute('transform',`translate(${120+mirrorX*3.6} ${30+mirrorY*3.6})`);surface.querySelector('[data-reflection]')?.setAttribute('transform',`translate(${120+x*3.6} ${30+y*3.6})`);}
    if(state.kind==='sequence'){const strip=surface.querySelector<HTMLElement>('[data-stream]');if(strip)strip.style.transform=`translateX(${-streamPosition*52}px)`;}
    root.classList.toggle('challenge-holding',held);
  }
  function refresh(c:ChallengeState,previous?:ChallengeState){
    const focus=document.activeElement as HTMLElement|null,focusKey=focus?.dataset.knob!==undefined?`[data-knob="${focus.dataset.knob}"]`:focus?.dataset.dial!==undefined?`[data-dial="${focus.dataset.dial}"]`:'';
    if(c.kind==='hex'&&surface.querySelector('.hex-tile')){
      for(const g of surface.querySelectorAll<HTMLElement>('.hex-channels')){const i=Number(g.parentElement!.dataset.choice),old=rotations.get(i)??{mod:c.values[i],angle:c.values[i]*60},delta=(c.values[i]-old.mod+6)%6;old.angle+=(delta===5?-1:delta)*60;old.mod=c.values[i];rotations.set(i,old);g.style.transform=`rotate(${old.angle}deg)`;}
    }else if(c.kind==='waveform'&&surface.querySelectorAll('[data-receiver]').length===c.total){
      for(const input of surface.querySelectorAll<HTMLInputElement>('[data-dial]')){const i=Number(input.dataset.dial);if(i!==editingIndex&&input!==knob?.input)input.value=String(c.values[i]);const dial=input.previousElementSibling as HTMLElement;dial.style.setProperty('--dial-angle',`${Number(input.value)*2.7-135}deg`);dial.setAttribute('aria-valuenow',input.value);}
      for(let n=0;n<c.total;n++){const receiver=surface.querySelector<HTMLElement>(`[data-receiver="${n}"]`)!,values=c.values.slice(n*4,n*4+4);for(const input of receiver.querySelectorAll<HTMLInputElement>('[data-dial]'))values[Number(input.dataset.dial)%4]=Number(input.value);receiver.querySelector('.receiver-plot')!.innerHTML=receiverPlot(c.target.slice(n*4,n*4+4),values);receiver.classList.toggle('receiver-aligned',receiverAligned(c,n));}
    }else{surface.innerHTML=advancedArt(c);if(c.kind==='hex')c.values.forEach((mod,i)=>rotations.set(i,{mod,angle:mod*60}));}
    controls.innerHTML=c.kind==='waveform'?'<button data-check>Lock all signals</button>':c.kind==='glyph'?'<button data-check>Verify full code</button>':c.kind==='rotor'?'<button data-hit>Set pin</button>':c.kind==='sequence'?'<button data-transfer>Hold to transfer</button>':c.kind==='worm'?`<div class="worm-pad">${['↑','→','↓','←'].map((s,i)=>`<button data-direction="${i}" aria-label="Move ${['up','right','down','left'][i]}">${s}</button>`).join('')}</div>`:'';
    if(c.failed&&gm){const retry=document.createElement('button');retry.dataset.retry='';retry.textContent='Allow another attempt';controls.append(retry);}
    progress.textContent=c.kind==='waveform'?`${Array.from({length:c.total},(_,i)=>receiverAligned(c,i)).filter(Boolean).length}/${c.total} receivers`:c.kind==='rotor'?`${c.values.filter(Boolean).length}/${c.values.length} pins`:c.kind==='worm'?`${c.used.length}/${c.target.length} dots · ${c.livesLeft} lives`:c.kind==='orbit'||c.kind==='mirror'?`${c.used.length}/${c.pieces.length}`:c.kind==='sequence'?`${c.values.reduce((a,b)=>a+b,0)}/${c.target.filter((_,i)=>i%2===1).reduce((a,b)=>a+b,0)} symbols`:'';
    if(['rotor','mirror','orbit'].includes(c.kind)&&c.rules!.mistakeLimit>0)progress.textContent+=` · ${Math.max(0,c.rules!.mistakeLimit-c.mistakes)} misses left`;
    root.querySelector('.challenge-help')!.textContent=c.kind==='waveform'?'Tune every receiver, then lock the whole rack. Dashed amber is the target; cyan is your signal.':c.kind==='hex'?'Connect every channel. Click turns clockwise; right click turns backward.':c.kind==='rotor'?`Click or Space when the sweep reaches a pin.${c.rules!.reverse?' Every press reverses the sweep.':''}`:c.kind==='glyph'?'Deduce the full code from the shuffled overlapping clue pairs. Rotate each ring, then verify the whole chain.':c.kind==='mirror'?'The gold cursor reflects across the line. Place it over each target and click.':c.kind==='orbit'?'Move the mouse inward/outward to select a track, or use W/S and ↑/↓. Tap click or Space for a dot; hold through the arc and release at its end.':c.kind==='sequence'?'Hold Space, the screen, or Transfer while a needed symbol crosses the gate. Release over other symbols and completed groups.':'Arrow keys / WASD steer. Collect every dot. Space boosts. Edges, walls, and your own body cause collisions.';
    feedback.textContent=c.failed?(c.feedback==='Time expired.'?'Time expired. ':'Attempt ended. ')+(c.rules!.retry==='reopen'?'Close and reopen to retry, or ask the GM.':'Wait for the GM to reset the attempt.'):c.feedback;
    if(focusKey)surface.querySelector<HTMLElement>(focusKey)?.focus({preventScroll:true});
    if(c.kind==='glyph'&&previous&&!matchMedia('(prefers-reduced-motion: reduce)').matches)surface.querySelectorAll('.reel-selected').forEach((el,i)=>{if(previous.values[i]!==c.values[i])el.animate([{transform:'translateY(-20px)',opacity:.3},{transform:'translateY(0)',opacity:1}],{duration:150,easing:'ease-out'});});
    positions();
  }
  function update(p:PublicPuzzle,canPlay:boolean,isGM:boolean,pending:boolean,autoEnter=true){
    root.hidden=p.puzzleType!=='challenge'||p.challenge?.version!==2;if(root.hidden){stop();return;}
    let c:ChallengeState;try{c=validateChallenge(p.challenge);}catch{play=false;stop();feedback.textContent='Invalid console data. Ask the GM to restore a private backup.';return;}
    const previous=state,changed=key!==p.puzzleId||c.kind!==previous?.kind;
    if(changed){key=p.puzzleId;revision=-1;rotations.clear();queue.length=0;entered='';phase=c.kind==='orbit'?c.target[0]??0:0;streamPosition=0;ring=0;stop();surface.replaceChildren();}
    else if(previous?.attempt!==c.attempt){stop();queue.length=0;phase=c.kind==='orbit'?c.target[0]??0:0;streamPosition=0;ring=0;direction=1;}
    if(previous&&c.livesLeft!==previous.livesLeft){moving=false;direction=1;}
    state=c;play=canPlay;gm=isGM;busy=pending;autoEnterAllowed=autoEnter;root.dataset.kind=c.kind;root.dataset.disabled=String(!canPlay);root.classList.toggle('challenge-failed',c.failed);root.classList.toggle('challenge-complete',c.opened);
    if(!play||c.failed||c.opened)stop();if(c.failed||c.opened)queue.length=0;
    if(revision!==p.revision){revision=p.revision;expiryPending=false;refresh(c,previous);}
    for(const button of root.querySelectorAll<HTMLButtonElement>('button'))button.disabled=button.hasAttribute('data-retry')?!gm||pending:!allowed()||(pending&&button.hasAttribute('data-check'));
    for(const input of root.querySelectorAll<HTMLInputElement>('input'))input.disabled=!allowed();
    for(const tile of surface.querySelectorAll<SVGElement>('.hex-tile')){tile.setAttribute('tabindex',allowed()?'0':'-1');tile.setAttribute('aria-disabled',String(!allowed()));}if(c.kind==='hex'){const art=surface.querySelector('svg')!;art.removeAttribute('aria-hidden');art.setAttribute('role','group');art.setAttribute('aria-label','Hex circuit board');}
    const enterKey=key+':'+c.attempt;
    if(autoEnter&&canPlay&&!pending&&!sending&&(entered!==enterKey||!!c.rules!.timerSeconds&&!c.clock!.deadline)){entered=enterKey;queueMicrotask(()=>send({op:'enter'}));}
    if(!pending)void pump();
  }
  function pointerPoint(e:PointerEvent|MouseEvent){const art=surface.querySelector('svg')!,point=new DOMPoint(e.clientX,e.clientY).matrixTransform(art.getScreenCTM()!.inverse());return{x:point.x,y:point.y};}
  function beginHold(){if(!allowed()||held||!state)return;held=true;heldAt=performance.now();heldPhase=phase;heldRing=ring;nextCapture=heldAt+100;if(state.kind==='rotor'){send({op:'hit',phase:Math.round(phase)%360});held=false;}positions();}
  function endHold(){if(!held||!state)return;const duration=Math.min(3000,Math.round(performance.now()-heldAt));held=false;if(state.kind==='orbit'){const dir=state.rules!.reverse&&heldRing%2?-1:1;send({op:'hit',index:heldRing,phase:Math.round((heldPhase*dir+360)%360),hold:duration});}positions();}
  function steer(d:number){if(!allowed()||!state||state.kind!=='worm')return;const h=state.values[0],next=h+[-12,1,12,-1][d];if(next===state.values[1])return;direction=d;if(!moving){moving=true;nextMove=performance.now();}}
  root.addEventListener('click',e=>{const t=(e.target as Element).closest<HTMLElement>('[data-choice],[data-check],[data-retry],[data-direction]');if(!t)return;if(t.hasAttribute('data-retry')){if(gm&&!busy)send({op:'retry'});return;}if(!allowed())return;
    if(t.dataset.choice!==undefined)send({op:'choose',index:Number(t.dataset.choice),value:1});if(t.hasAttribute('data-check'))send({op:'check'});if(t.dataset.direction!==undefined)steer(Number(t.dataset.direction));});
  root.addEventListener('contextmenu',e=>{if(!state||!['hex','glyph'].includes(state.kind))return;const t=(e.target as Element).closest<HTMLElement>('[data-choice]');if(t){e.preventDefault();send({op:'choose',index:Number(t.dataset.choice),value:-1});}});
  root.addEventListener('input',e=>{const input=e.target as HTMLInputElement;if(input.dataset.dial===undefined||!state)return;const index=Number(input.dataset.dial),receiver=Math.floor(index/4),values=state.values.slice(receiver*4,receiver*4+4);for(const other of surface.querySelectorAll<HTMLInputElement>(`[data-receiver="${receiver}"] input[data-dial]`))values[Number(other.dataset.dial)%4]=Number(other.value);
    surface.querySelector(`[data-receiver="${receiver}"] .receiver-plot`)!.innerHTML=receiverPlot(state.target.slice(receiver*4,receiver*4+4),values);const dial=input.previousElementSibling as HTMLElement;dial.style.setProperty('--dial-angle',`${Number(input.value)*2.7-135}deg`);dial.setAttribute('aria-valuenow',input.value);});
  root.addEventListener('change',e=>{const input=e.target as HTMLInputElement;if(input.dataset.dial!==undefined)send({op:'set',index:Number(input.dataset.dial),value:Number(input.value)});});
  root.addEventListener('pointerdown',e=>{
    const range=(e.target as Element).closest<HTMLInputElement>('input[data-dial]');if(range&&allowed())editingIndex=Number(range.dataset.dial);
    const dial=(e.target as Element).closest<HTMLElement>('[data-knob]');if(dial&&allowed()){e.preventDefault();dial.setPointerCapture(e.pointerId);const input=surface.querySelector<HTMLInputElement>(`[data-dial="${dial.dataset.knob}"]`)!;knob={input,value:Number(input.value),x:e.clientX,y:e.clientY};return;}
    if(!allowed()||!state||e.button!==0)return;
    if((e.target as Element).closest('[data-hit],[data-transfer]')||(surface.contains(e.target as Node)&&['orbit','sequence'].includes(state.kind))){e.preventDefault();(e.target as Element).setPointerCapture(e.pointerId);beginHold();}
    if(surface.contains(e.target as Node)&&state.kind==='mirror'){const point=pointerPoint(e);mirrorX=Math.max(0,Math.min(100,(point.x-120)/3.6));mirrorY=Math.max(0,Math.min(100,(point.y-30)/3.6));positions();send({op:'hit',index:Math.round(mirrorX),value:Math.round(mirrorY)});}
  });
  root.addEventListener('pointermove',e=>{if(knob){knob.input.value=String(Math.max(Number(knob.input.min),Math.min(100,Math.round(knob.value+(e.clientX-knob.x+knob.y-e.clientY)/2))));knob.input.dispatchEvent(new Event('input',{bubbles:true}));return;}if(!state||!surface.contains(e.target as Node)||!surface.querySelector('svg'))return;const p=pointerPoint(e);
    if(state.kind==='mirror'){mirrorX=Math.max(0,Math.min(100,(p.x-120)/3.6));mirrorY=Math.max(0,Math.min(100,(p.y-30)/3.6));}
    if(state.kind==='orbit'&&!held){const distance=Math.hypot(p.x-300,p.y-210);ring=Array.from({length:state.rules!.count},(_,i)=>i).reduce((a,b)=>Math.abs(distance-orbitRadius(state!,b))<Math.abs(distance-orbitRadius(state!,a))?b:a,0);}
    positions();
  });
  root.addEventListener('pointerup',()=>{if(knob){const input=knob.input;knob=undefined;input.dispatchEvent(new Event('change',{bubbles:true}));}endHold();});
  root.addEventListener('pointercancel',()=>{held=false;knob=undefined;});
  function keyDown(e:KeyboardEvent){if(root.hidden||!allowed()||(e.target as HTMLElement).matches('input,select,textarea')||e.ctrlKey||e.metaKey||e.altKey)return;
    const target=(e.target as Element).closest<HTMLElement>('[data-knob]');if(target&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const input=surface.querySelector<HTMLInputElement>(`[data-dial="${target.dataset.knob}"]`)!;input.value=String(Number(input.value)+(['ArrowUp','ArrowRight'].includes(e.key)?1:-1));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return;}
    if((e.code==='Space'||e.key==='Enter')&&(e.target as Element).matches('[data-choice]')){e.preventDefault();if(!e.repeat)(e.target as HTMLElement).click();return;}
    if(e.code==='Space'&&state&&['rotor','orbit','sequence','worm'].includes(state.kind)){e.preventDefault();if(state.kind==='worm')boost=true;else if(!e.repeat)beginHold();return;}
    const dirs:Record<string,number>={ArrowUp:0,w:0,W:0,ArrowRight:1,d:1,D:1,ArrowDown:2,s:2,S:2,ArrowLeft:3,a:3,A:3};
    if(state?.kind==='worm'&&e.key in dirs){e.preventDefault();steer(dirs[e.key]);}
    if(state?.kind==='orbit'&&['ArrowUp','ArrowDown','w','s','W','S'].includes(e.key)){e.preventDefault();if(!held){ring=Math.max(0,Math.min(state.rules!.count-1,ring+(['ArrowUp','w','W'].includes(e.key)?1:-1)));positions();}}
  }
  function keyUp(e:KeyboardEvent){if(e.code==='Space'){boost=false;endHold();}}
  function visibility(){if(document.hidden){wasHidden=true;stop();}else if(wasHidden){wasHidden=false;if(autoEnterAllowed&&play&&state?.rules?.retry==='reopen')send({op:'enter'});}}
  function releasePointer(){editingIndex=undefined;if(knob){const input=knob.input;knob=undefined;input.dispatchEvent(new Event('change',{bubbles:true}));}endHold();}
  function frame(now:number){if(disposed)return;const dt=Math.min(50,now-last);last=now;
    if(state){const c=state,clock=c.clock!,remaining=clock.deadline?Math.max(0,clock.deadline-(clock.pausedAt||Date.now())):c.rules!.timerSeconds*1000;timer.hidden=!c.rules!.timerSeconds;timer.textContent=`${Math.floor(Math.ceil(remaining/1000)/60)}:${String(Math.ceil(remaining/1000)%60).padStart(2,'0')}`;timer.classList.toggle('timer-urgent',remaining<10000);
      if(allowed()&&clock.deadline&&!clock.pausedAt&&remaining<=0&&!expiryPending){expiryPending=true;send({op:'expire'});}
      if(allowed()&&!document.hidden){
        if(c.kind==='rotor')phase=(phase+dt*c.rules!.speed/1000*(c.rules!.reverse&&c.moves%2?-1:1)+360)%360;
        if(c.kind==='orbit')phase=(phase+dt*c.rules!.speed/1000)%360;
        if(c.kind==='sequence'){
          streamPosition=(streamPosition+dt*c.rules!.speed/1000)%c.pieces[0].length;
          if(held&&now>=nextCapture&&!sending&&!busy&&!queue.length){nextCapture=now+100;send({op:'capture',index:c.pieces[0][Math.floor(streamPosition)],value:1});}
        }
        if(c.kind==='worm'&&moving&&now>=nextMove&&!sending&&!busy&&!queue.length){nextMove=now+1000/(c.rules!.speed*(boost?1.8:1));send({op:'move',index:direction});}
      }
      positions();
    }
    raf=requestAnimationFrame(frame);
  }
  document.addEventListener('keydown',keyDown);document.addEventListener('keyup',keyUp);window.addEventListener('blur',stop);window.addEventListener('pointerup',releasePointer);document.addEventListener('visibilitychange',visibility);raf=requestAnimationFrame(frame);
  return{update,report:(message:string)=>{feedback.textContent=message;},dispose:()=>{disposed=true;queue.length=0;stop();cancelAnimationFrame(raf);document.removeEventListener('keydown',keyDown);document.removeEventListener('keyup',keyUp);window.removeEventListener('blur',stop);window.removeEventListener('pointerup',releasePointer);document.removeEventListener('visibilitychange',visibility);root.replaceChildren();}};
}
