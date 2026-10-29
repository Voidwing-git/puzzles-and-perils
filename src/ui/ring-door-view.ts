import {ringNames,ringSymbols,RING_STEPS,effectiveRingSymbols} from '../core/ring-door.ts';
import type {PublicPuzzle} from '../core/state.ts';
import {ringDoorArt} from './ring-door-art.ts';
import './ring-door.css';

export function mountRingDoorView(root:HTMLElement,request:(ring:number)=>Promise<boolean>){
  root.classList.add('ring-door-panel');
  root.innerHTML=`<div class="ring-door-surface">${ringDoorArt(true)}</div>
    <div class="ring-door-controls">${ringNames.map((name,i)=>`<button type="button" class="secondary-button" data-ring-button="${i}"><strong>${name} ring</strong><span class="ring-door-symbol"></span></button>`).join('')}</div>
    <p class="ring-door-help">Click a ring to turn it. Align the three symbols at the top.</p><p class="ring-door-status" role="status" aria-live="polite"></p>`;
  const surface=root.querySelector<HTMLElement>('.ring-door-surface')!;
  let rings=Array.from(root.querySelectorAll<SVGGElement>('.door-ring')),symbolKey='';
  const buttons=Array.from(root.querySelectorAll<HTMLButtonElement>('[data-ring-button]'));
  const status=root.querySelector<HTMLElement>('.ring-door-status')!;
  let enabled=false,busy=false,pending=false,disposed=false,puzzleId='',lastRevision=-1;
  let positions=[0,0,0],angles=[0,0,0],message='';
  const frames=new Set<number>();
  function draw(){
    const disabled=!enabled||busy||pending;root.dataset.disabled=String(disabled);
    for(const button of buttons)button.disabled=disabled;
    root.setAttribute('aria-busy',String(busy||pending));status.textContent=message;
  }
  async function rotate(ring:number){
    if(!enabled||busy||pending||disposed)return;
    pending=true;message='';draw();
    try{await request(ring);}finally{pending=false;if(!disposed)draw();}
  }
  for(const button of buttons)button.onclick=()=>{void rotate(Number(button.dataset.ringButton));};
  surface.addEventListener('click',event=>{
    const hit=(event.target as Element).closest('[data-ring-hit]');if(hit)void rotate(Number(hit.getAttribute('data-ring-hit')));
  });
  return{
    update(next:PublicPuzzle,canPlay:boolean,externalBusy:boolean){
      root.hidden=next.puzzleType!=='ring-door';
      const door=next.ringDoor;if(root.hidden||!door){enabled=false;draw();return;}
      enabled=canPlay&&!next.paused&&!door.opened;busy=externalBusy;
      const symbols=effectiveRingSymbols(door),nextSymbolKey=symbols.join(',');
      const fresh=next.puzzleId!==puzzleId||nextSymbolKey!==symbolKey;
      if(nextSymbolKey!==symbolKey){surface.innerHTML=ringDoorArt(true,symbols);rings=Array.from(surface.querySelectorAll<SVGGElement>('.door-ring'));symbolKey=nextSymbolKey;}
      if(fresh){puzzleId=next.puzzleId;lastRevision=-1;positions=[...door.positions];angles=positions.map(position=>position*360/RING_STEPS);message='';root.classList.toggle('ring-restored-open',door.opened);}
      if(next.revision!==lastRevision){
        for(const [i,ring]of rings.entries()){
          if(!fresh)angles[i]+=((door.positions[i]-positions[i]+RING_STEPS)%RING_STEPS)*360/RING_STEPS;
          if(fresh)ring.style.transition='none';
          ring.style.setProperty('--ring-angle',angles[i]+'deg');
          const symbol=ringSymbols[symbols[door.positions[i]]];
          buttons[i].querySelector('.ring-door-symbol')!.textContent=symbol;
          buttons[i].setAttribute('aria-label',`Rotate ${ringNames[i].toLowerCase()} ring (${symbol})`);
          if(fresh){const frame=requestAnimationFrame(()=>{frames.delete(frame);if(!disposed)ring.style.removeProperty('transition');});frames.add(frame);}
        }
        positions=[...door.positions];lastRevision=next.revision;
      }
      if(!door.opened)root.classList.remove('ring-restored-open');
      root.classList.toggle('ring-door-open',door.opened);draw();
    },
    report(value:string){message=value;draw();},
    dispose(){disposed=true;for(const frame of frames)cancelAnimationFrame(frame);frames.clear();},
  };
}
