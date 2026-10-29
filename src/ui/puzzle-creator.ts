import {mountChallengeAuthoring} from './challenge-authoring.ts';
import {challengeCatalog,type ChallengeKind} from '../core/challenges.ts';
import {mountAuthoring} from './authoring.ts';
import {mountLockAuthoring} from './lock-authoring.ts';
import {mountRingDoorAuthoring} from './ring-door-authoring.ts';
import type {PrivatePreparation} from '../core/state.ts';

export function mountPuzzleCreator(root:HTMLElement,finalize:(puzzle:PrivatePreparation)=>Promise<void>,scope:string,initial?:PrivatePreparation){
  let dispose:(()=>void)|undefined,busy=false;
  async function publish(draft:PrivatePreparation){busy=true;const back=root.querySelector<HTMLButtonElement>('.puzzle-types-back');if(back)back.disabled=true;try{await finalize(draft);}finally{busy=false;if(back)back.disabled=false;}}
  function choose(type:'pipes'|'lockpick'|'ring-door'|ChallengeKind,editing?:PrivatePreparation){
    if(busy)return;
    dispose?.();root.replaceChildren();
    if(!editing){const back=document.createElement('button');back.type='button';back.className='text-button puzzle-types-back';back.textContent='← Puzzle types';back.onclick=showChoices;root.append(back);}
    const editor=document.createElement('div');root.append(editor);
    if(Object.hasOwn(challengeCatalog,type)){dispose=mountChallengeAuthoring(editor,publish,scope,editing,type as ChallengeKind);return;}
    dispose=(type==='ring-door'?mountRingDoorAuthoring:type==='lockpick'?mountLockAuthoring:mountAuthoring)(editor,publish,scope,editing);
  }
  function showChoices(){
    if(busy)return;
    dispose?.();dispose=undefined;
    root.innerHTML=`<section class="puzzle-picker" aria-labelledby="puzzle-picker-title"><p class="eyebrow">GM setup</p><h1 id="puzzle-picker-title">Choose a puzzle</h1><p>Pick the challenge your players will face.</p><div class="puzzle-type-cards">
      <button id="choose-pipes" type="button" class="puzzle-type-card"><img src="${import.meta.env.BASE_URL}previews/channels.png" alt="A runic channel puzzle with glowing paths on stone tiles"/><span class="puzzle-card-copy"><strong>Runic channels</strong><span>Rotate stone channels to connect the currents.</span><small>Flat boards · Cube surfaces · Raised dais</small></span></button>
      <button id="choose-lockpick" type="button" class="puzzle-type-card"><img src="${import.meta.env.BASE_URL}previews/lockpick.png" alt="A brass lock with a pick and tension wrench"/><span class="puzzle-card-copy"><strong>Lock picking</strong><span>Find the opening angle. Feel the lock give.</span><small>Novice to Master · DC 5–25</small></span></button>
      <button id="choose-ring-door" type="button" class="puzzle-type-card"><img src="${import.meta.env.BASE_URL}previews/ring-door.png" alt="Three carved symbol rings on an ancient stone door"/><span class="puzzle-card-copy"><strong>Ring door</strong><span>Align three symbol rings to open the passage.</span><small>Nine symbols · Random combinations</small></span></button>
      ${Object.entries(challengeCatalog).map(([kind,info])=>`<button id="choose-${kind}" type="button" class="puzzle-type-card"><img src="${import.meta.env.BASE_URL}previews/${kind}.png" alt="${info.name} gameplay preview"/><span class="puzzle-card-copy"><strong>${info.name}</strong><span>${info.hint}</span><small>${info.source}</small></span></button>`).join('')}
    </div></section>`;
    root.querySelector<HTMLButtonElement>('#choose-pipes')!.onclick=()=>choose('pipes');root.querySelector<HTMLButtonElement>('#choose-lockpick')!.onclick=()=>choose('lockpick');
    root.querySelector<HTMLButtonElement>('#choose-ring-door')!.onclick=()=>choose('ring-door');
    for(const kind of Object.keys(challengeCatalog) as ChallengeKind[])root.querySelector<HTMLButtonElement>('#choose-'+kind)!.onclick=()=>choose(kind);
  }
  if(initial)choose(initial.state.puzzleType==='challenge'?initial.state.challenge!.kind:initial.state.puzzleType==='ring-door'?'ring-door':initial.state.puzzleType==='lockpick'?'lockpick':'pipes',initial);else showChoices();
  return()=>dispose?.();
}
