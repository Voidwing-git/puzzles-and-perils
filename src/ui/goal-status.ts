import type {Energy,PublicPuzzle} from '../core/state.ts';

const colors:Energy[]=['azure','amber','verdant'];
export function renderGoals(panel:HTMLElement,puzzle:PublicPuzzle) {
  const list=panel.querySelector<HTMLElement>('#goal-list')!;
  const active=new Set<Energy>();
  for(const energy of colors) {
    const goals=puzzle.targets.filter(index=>(puzzle.tiles[index]?.energy??'azure')===energy);
    if(!goals.length)continue;
    active.add(energy);
    const powered=goals.filter(index=>puzzle.poweredTargets.includes(index)).length;
    let counter=list.querySelector<HTMLElement>('[data-energy="'+energy+'"]');
    if(!counter) {
      counter=document.createElement('span');counter.className='goal-counter '+energy;
      counter.dataset.energy=energy;counter.setAttribute('role','listitem');
      counter.append(document.createElement('strong'));list.append(counter);
    }
    counter.querySelector('strong')!.textContent=powered+'/'+goals.length;
    counter.classList.toggle('full',powered===goals.length);
    counter.dataset.full=String(powered===goals.length);
    counter.title=energy[0].toUpperCase()+energy.slice(1)+' goals: '+powered+' of '+goals.length+' powered';
    counter.setAttribute('aria-label',counter.title);
  }
  for(const counter of list.querySelectorAll<HTMLElement>('[data-energy]'))if(!active.has(counter.dataset.energy as Energy))counter.remove();
}
