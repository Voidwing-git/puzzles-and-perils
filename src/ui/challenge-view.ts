import {challengeCatalog,mirrorPoint,validateChallenge,type ChallengeAction,type ChallengeState} from '../core/challenges.ts';
import type {PublicPuzzle} from '../core/state.ts';
import {consoleSkin} from './challenge-skins.ts';
import './challenges.css';
import './challenge-skins.css';
const path=(points:number[][])=>points.map((p,i)=>`${i?'L':'M'}${p.join(',')}`).join(' ');
function wave(v:number[],className:string){return `<path class="${className}" d="${path(Array.from({length:301},(_,i)=>[i*2,160-Math.sin(i*2/(v[0]*3)*Math.PI*2)*v[1]*1.2]))}"/>`;}
export function challengeArt(c:ChallengeState):string{
  const skin=consoleSkin(c);if(skin!==undefined)return skin;
  return `<svg viewBox="0 0 600 320" class="challenge-art" aria-hidden="true"><path class="scope-grid" d="${Array.from({length:11},(_,i)=>`M${i*60} 0v320`).join(' ')} ${Array.from({length:7},(_,i)=>`M0 ${i*53}h600`).join(' ')}"/>${wave(c.target,'target-wave')}${wave(c.values,'player-wave')}</svg><div class="wave-legend"><span>Target</span><span>Your signal</span></div>`;
}

export function mountChallengeView(root:HTMLElement,request:(a:ChallengeAction)=>Promise<boolean>){
  root.innerHTML='<div class="challenge-heading"><span class="challenge-kicker"></span><strong class="challenge-progress"></strong></div><div class="challenge-surface"></div><div class="challenge-controls"></div><p class="challenge-help"></p><p class="challenge-feedback" role="status"></p>';
  const surface=root.querySelector<HTMLElement>('.challenge-surface')!,controls=root.querySelector<HTMLElement>('.challenge-controls')!,feedback=root.querySelector<HTMLElement>('.challenge-feedback')!;
  let state:ChallengeState|undefined,key='',revision=-1,canPlay=false,busy=false,gm=false,running=false,disposed=false;
  let knob:{input:HTMLInputElement;startY:number;startX:number;value:number}|undefined;
  let phase=0,streamPhase=0,lastTime=0,raf=0,speed=1,ring=0,heldAt=0,heldPhase=0,heldSymbol=0,mirrorX=50,mirrorY=50,direction=1,nextMove=0,boost=false,ownPending=false;
  const timed=()=>state&&['rotor','orbit','sequence','worm'].includes(state.kind);
  const allowed=()=>canPlay&&!busy&&!ownPending&&!state?.failed&&!state?.opened;
  async function send(a:ChallengeAction){if(!allowed()&&a.op!=='retry')return false;ownPending=true;try{return await request(a);}finally{ownPending=false;}}
  function refreshControls(){
    if(!state)return;const c=state;
    if(c.kind==='waveform')controls.innerHTML=c.values.map((n,i)=>`<label class="wave-control"><span>${i?'Amplitude':'Wavelength'}</span><span class="wave-dial" data-knob="${i}" role="slider" tabindex="0" aria-label="${i?'Amplitude':'Wavelength'} dial" aria-valuemin="10" aria-valuemax="100" aria-valuenow="${n}" style="--dial-angle:${(n-10)*3-135}deg"></span><input type="range" min="10" max="100" value="${n}" data-dial="${i}" aria-label="${i?'Amplitude':'Wavelength'}"/></label>`).join('')+'<button data-check>Lock signal</button>';
    else if(c.kind==='spectrum')controls.innerHTML='<button data-check>Analyze sample</button>';
    else if(c.kind==='terminal')controls.replaceChildren();
    else if(c.kind==='glyph')controls.innerHTML='<button data-check>Verify pair</button>';
    else if(timed())controls.innerHTML=`<button data-start>${running?'Stop':'Start'}</button>${c.kind==='orbit'?`<label>Ring<select data-ring>${['Inner','Middle','Outer'].map((n,i)=>`<option value="${i}" ${ring===i?'selected':''}>${n}</option>`).join('')}</select></label><label>Speed<input aria-label="Orbit speed" data-speed type="range" min="0.5" max="1.5" step="0.25" value="${speed}"/></label>`:''}${c.kind==='worm'?'<div class="worm-pad">'+['↑','→','↓','←'].map((s,i)=>`<button data-direction="${i}" aria-label="Move ${['up','right','down','left'][i]}">${s}</button>`).join('')+'</div>':`<button data-hit>${c.kind==='sequence'?'Hold to capture':c.kind==='orbit'?'Catch / hold':'Set pin'}</button>`}`;
    else controls.replaceChildren();
    if(c.failed&&gm){const b=document.createElement('button');b.textContent='Allow another attempt';b.dataset.retry='';controls.append(b);}
  }
  function render(c:ChallengeState,previous?:number[]){
    const focused=document.activeElement as HTMLElement|null;
    const focusKey=focused?.dataset.knob!==undefined?`[data-knob="${focused.dataset.knob}"]`:focused?.dataset.dial!==undefined?`[data-dial="${focused.dataset.dial}"]`:'';
    if(c.kind==='hex'&&surface.querySelector('.hex-tile')){surface.querySelectorAll<HTMLElement>('.hex-channels').forEach((g,i)=>{const previous=Number(g.dataset.rotation??g.style.transform.replace(/[^\d.-]/g,''))/60,delta=((c.values[i]-previous+9)%6)-3,next=previous+delta;g.style.transform=`rotate(${next*60}deg)`;g.dataset.rotation=String(next*60);});}
    else surface.innerHTML=challengeArt(c);surface.querySelector('[data-orbit-gate]')?.setAttribute('transform',`translate(300 ${140-ring*55})`);refreshControls();root.querySelector('.challenge-help')!.textContent=challengeCatalog[c.kind].hint;root.querySelector('.challenge-kicker')!.textContent=challengeCatalog[c.kind].name;
    root.querySelector('.challenge-progress')!.textContent=c.kind==='terminal'?`${c.values[0]} attempts remaining`:['spectrum','waveform'].includes(c.kind)?`${c.stage}/${c.total}`:c.kind==='rotor'?`${c.values.filter(Boolean).length}/8 pins`:c.kind==='glyph'?`${c.used.length}/3 pairs`:['mirror','orbit','sequence','worm'].includes(c.kind)?`${c.used.length}/${c.kind==='mirror'?6:c.kind==='orbit'?9:c.target.length}`:'';
    if(['rotor','mirror','orbit'].includes(c.kind)&&!c.opened)root.querySelector('.challenge-progress')!.textContent+=` · ${Math.max(0,5-c.mistakes)} misses left`;
    if(focusKey)controls.querySelector<HTMLElement>(focusKey)?.focus({preventScroll:true});
    if(c.kind==='mirror'){const [rx,ry]=mirrorPoint(c.target[0],mirrorX,mirrorY);surface.querySelector('[data-pointer]')?.setAttribute('transform',`translate(${120+mirrorX*3.6} ${30+mirrorY*3.6})`);surface.querySelector('[data-reflection]')?.setAttribute('transform',`translate(${120+rx*3.6} ${30+ry*3.6})`);}
    if(c.kind==='glyph'&&previous&&!matchMedia('(prefers-reduced-motion: reduce)').matches){surface.querySelectorAll('.reel-selected').forEach((symbol,i)=>{if(previous[i]!==c.values[i])symbol.animate([{transform:'translateY(-22px)',opacity:.25},{transform:'translateY(0)',opacity:1}],{duration:160,easing:'ease-out'});});}
    feedback.textContent=c.failed?'Attempt ended. The GM can allow another attempt.':c.kind==='terminal'&&c.feedback.includes('likeness')?'':c.feedback;
  }
  function update(p:PublicPuzzle,play:boolean,isGM:boolean,pending:boolean){
    const active=p.puzzleType==='challenge'&&!!p.challenge;root.hidden=!active;if(!active){running=false;heldAt=0;return;}
    let c:ChallengeState;try{c=validateChallenge(p.challenge);}catch{running=false;canPlay=false;state=undefined;revision=-1;surface.replaceChildren();controls.replaceChildren();feedback.textContent='Console data is invalid. Ask the GM to restore a private backup.';return;}
    const changed=key!==p.puzzleId||state?.stage!==c.stage;
    if(changed){key=p.puzzleId;running=false;phase=c.target[0]??0;streamPhase=0;heldAt=0;speed=1;ring=0;direction=1;revision=-1;}
    canPlay=play;busy=pending;gm=isGM;const previous=state?.values;state=c;
    if(!play||c.opened||c.failed){running=false;heldAt=0;}
    if(revision!==p.revision){revision=p.revision;render(c,previous);}
    if(c.kind==='hex'){const art=surface.querySelector('svg')!;art.removeAttribute('aria-hidden');art.setAttribute('role','group');art.setAttribute('aria-label','Hex circuit board');for(const tile of surface.querySelectorAll<SVGElement>('[data-choice]')){tile.setAttribute('tabindex',play?'0':'-1');tile.setAttribute('aria-disabled',String(!play));}}
    root.dataset.kind=c.kind;root.dataset.disabled=String(!play);root.classList.toggle('challenge-complete',c.opened);root.classList.toggle('challenge-failed',c.failed);
    for(const button of root.querySelectorAll<HTMLButtonElement>('button')){const choice=button.dataset.choice,bracket=button.dataset.bracket;button.disabled=button.hasAttribute('data-retry')?!gm||pending:!play||pending||c.failed||c.opened||(c.kind==='terminal'&&((choice!==undefined&&c.used.includes(Number(choice)))||(bracket!==undefined&&c.used.includes(20+Number(bracket)))));}
    for(const input of controls.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select'))input.disabled=!play||c.failed||c.opened;
  }
  function hitDown(){if(!allowed()||!running||!state||heldAt)return;heldAt=performance.now();heldPhase=phase;heldSymbol=state.pieces[0]?.[Math.floor(streamPhase)%6]??0;if(state.kind==='rotor'){void send({op:'hit',phase:Math.round(phase)%360});heldAt=0;}}
  function hitUp(){if(!heldAt||!state)return;const duration=Math.min(3000,Math.round(performance.now()-heldAt));heldAt=0;if(state.kind==='orbit')void send({op:'hit',index:ring,phase:Math.round(heldPhase*(ring%2?-1:1)+360)%360,hold:duration,value:Math.round(speed*100)});if(state.kind==='sequence')void send({op:'hit',index:state.pieces[0][Math.floor(streamPhase)%6]===heldSymbol?heldSymbol:6,hold:duration});}
  function click(e:MouseEvent){const target=(e.target as Element).closest<HTMLElement>('[data-choice],[data-check],[data-bracket],[data-start],[data-retry],[data-direction]');if(!target)return;
    if(target.hasAttribute('data-retry')){if(gm&&!busy)void request({op:'retry'});return;}if(!allowed())return;
    if(target.hasAttribute('data-start')){running=!running;heldAt=0;lastTime=performance.now();nextMove=lastTime+450;target.textContent=running?'Stop':'Start';return;}
    if(target.dataset.direction!==undefined){direction=Number(target.dataset.direction);if(!running)void send({op:'move',index:direction});return;}
    if(target.hasAttribute('data-check'))void send({op:'check'});
    if(target.dataset.choice!==undefined)void send({op:'choose',index:Number(target.dataset.choice),...(state?.kind==='hex'?{value:1}:{})});
    if(target.dataset.bracket!==undefined)void send({op:'bracket',index:Number(target.dataset.bracket)});
  }
  root.addEventListener('click',click);
  root.addEventListener('contextmenu',e=>{const target=(e.target as Element).closest<HTMLElement>('[data-choice]');if(state?.kind==='hex'&&target){e.preventDefault();void send({op:'choose',index:Number(target.dataset.choice),value:-1});}});
  controls.addEventListener('input',e=>{const input=e.target as HTMLInputElement;if(input.dataset.dial!==undefined&&state){const values=[...state.values];values[Number(input.dataset.dial)]=Number(input.value);const other=controls.querySelector<HTMLInputElement>(`[data-dial="${1-Number(input.dataset.dial)}"]`);values[1-Number(input.dataset.dial)]=Number(other?.value??values[1-Number(input.dataset.dial)]);surface.innerHTML=challengeArt({...state,values});input.previousElementSibling?.setAttribute('style',`--dial-angle:${(Number(input.value)-10)*3-135}deg`);}if(input.hasAttribute('data-speed'))speed=Number(input.value);});
  controls.addEventListener('change',e=>{const input=e.target as HTMLInputElement;if(input.dataset.dial!==undefined)void send({op:'set',index:Number(input.dataset.dial),value:Number(input.value)});if(input.hasAttribute('data-ring')){ring=Number(input.value);surface.querySelector('[data-orbit-gate]')?.setAttribute('transform',`translate(300 ${140-ring*55})`);}});
  controls.addEventListener('pointerdown',e=>{const dial=(e.target as Element).closest<HTMLElement>('[data-knob]');if(!dial||!allowed())return;e.preventDefault();dial.setPointerCapture(e.pointerId);const input=controls.querySelector<HTMLInputElement>('[data-dial="'+dial.dataset.knob+'"]')!;knob={input,startY:e.clientY,startX:e.clientX,value:Number(input.value)};});
  controls.addEventListener('pointermove',e=>{if(!knob)return;knob.input.value=String(Math.max(10,Math.min(100,Math.round(knob.value+(knob.startY-e.clientY+e.clientX-knob.startX)/2))));knob.input.dispatchEvent(new Event('input',{bubbles:true}));});
  controls.addEventListener('pointerup',()=>{if(knob){const input=knob.input;knob=undefined;input.dispatchEvent(new Event('change',{bubbles:true}));}});
  controls.addEventListener('pointercancel',()=>{knob=undefined;});
  controls.addEventListener('keydown',e=>{const dial=(e.target as Element).closest<HTMLElement>('[data-knob]');if(!dial||!['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)||!allowed())return;e.preventDefault();const input=controls.querySelector<HTMLInputElement>('[data-dial="'+dial.dataset.knob+'"]')!;input.value=String(Number(input.value)+(['ArrowUp','ArrowRight'].includes(e.key)?1:-1));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
  controls.addEventListener('pointerdown',e=>{if((e.target as Element).closest('[data-hit]')){e.preventDefault();(e.target as HTMLElement).setPointerCapture(e.pointerId);hitDown();}});
  controls.addEventListener('pointerup',hitUp);controls.addEventListener('pointercancel',()=>{heldAt=0;});
  surface.addEventListener('pointermove',e=>{if(state?.kind!=='mirror')return;const box=surface.querySelector('svg')!.getBoundingClientRect(),x=(e.clientX-box.left)/box.width*600,y=(e.clientY-box.top)/box.height*420;
    mirrorX=Math.max(0,Math.min(100,(x-120)/3.6));mirrorY=Math.max(0,Math.min(100,(y-30)/3.6));const p=surface.querySelector('[data-pointer]')!,r=surface.querySelector('[data-reflection]')!;p.setAttribute('transform',`translate(${120+mirrorX*3.6} ${30+mirrorY*3.6})`);const [rx,ry]=mirrorPoint(state.target[0],mirrorX,mirrorY);r.setAttribute('transform',`translate(${120+rx*3.6} ${30+ry*3.6})`);});
  surface.addEventListener('click',()=>{if(state?.kind==='mirror')void send({op:'hit',index:Math.round(mirrorX),value:Math.round(mirrorY)});});
  function keyDown(e:KeyboardEvent){if(root.hidden||!canPlay||(e.target as HTMLElement)?.matches('input,select,textarea')||e.repeat)return;const dirs:Record<string,number>={ArrowUp:0,w:0,ArrowRight:1,d:1,ArrowDown:2,s:2,ArrowLeft:3,a:3};
    if(state?.kind==='worm'&&e.key in dirs){e.preventDefault();direction=dirs[e.key];if(!running)void send({op:'move',index:direction});}
    else if(state?.kind==='orbit'&&['a','d'].includes(e.key)){speed=Math.max(.5,Math.min(1.5,speed+(e.key==='a'?-.25:.25)));const range=controls.querySelector<HTMLInputElement>('[data-speed]');if(range)range.value=String(speed);}
    if(e.code==='Space'&&timed()){e.preventDefault();if(state?.kind==='worm')boost=true;else hitDown();}
    if((e.key==='Enter'||e.code==='Space')&&(e.target as Element).matches('[data-choice]')){e.preventDefault();(e.target as HTMLElement).click();}
  }
  function keyUp(e:KeyboardEvent){if(e.code==='Space'){boost=false;hitUp();}}
  function stop(){running=false;heldAt=0;boost=false;const b=controls.querySelector('[data-start]');if(b)b.textContent='Start';}
  function frame(now:number){if(disposed)return;const dt=Math.min(50,now-lastTime||0);lastTime=now;
    if(state&&running&&canPlay&&!state.failed&&!state.opened){
      if(state.kind==='rotor'){phase=(phase+dt*(.06+state.values.filter(Boolean).length*.009)*(state.moves%2?-1:1)+360)%360;surface.querySelector('[data-sweep]')?.setAttribute('transform',`rotate(${phase} 300 210)`);}
      if(state.kind==='orbit'){phase=(phase+dt*.055*speed)%360;for(const g of surface.querySelectorAll<SVGElement>('[data-orbit]'))g.setAttribute('transform',`rotate(${phase*(Number(g.dataset.orbit)%2?-1:1)} 300 210)`);}
      if(state.kind==='sequence'){streamPhase=(streamPhase+dt/1100)%6;const strip=surface.querySelector<HTMLElement>('[data-stream]');if(strip)strip.style.transform=`translateX(${-streamPhase*70}px)`;}
      if(state.kind==='worm'&&now>=nextMove&&!ownPending&&!busy){nextMove=now+(boost?180:450);void send({op:'move',index:direction});}
    }raf=requestAnimationFrame(frame);
  }
  document.addEventListener('keydown',keyDown);document.addEventListener('keyup',keyUp);window.addEventListener('blur',stop);const visibility=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',visibility);raf=requestAnimationFrame(frame);
  return{update,report:(message:string)=>{feedback.textContent=message;},dispose:()=>{disposed=true;cancelAnimationFrame(raf);document.removeEventListener('keydown',keyDown);document.removeEventListener('keyup',keyUp);window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',visibility);root.replaceChildren();}};
}
