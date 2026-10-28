const states=new WeakMap<HTMLElement,{puzzle:string;solved:boolean}>();

export function updateCompletionEffect(banner:HTMLElement,puzzle:string,solved:boolean) {
  const previous=states.get(banner);
  states.set(banner,{puzzle,solved});
  if(!solved) {
    banner.classList.remove('completion-celebrating');
    banner.getAnimations().forEach(animation=>animation.cancel());
    return;
  }
  if(previous?.puzzle===puzzle && previous.solved)return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  banner.dataset.celebrationCount=String(Number(banner.dataset.celebrationCount??0)+1);
  banner.classList.add('completion-celebrating');
  const animation=banner.animate([{boxShadow:'0 0 0 #a4f5ee00'},
    {boxShadow:'0 0 26px 3px #a4f5ee88',offset:.35},
    {boxShadow:'0 0 0 #a4f5ee00'}],{duration:1000,easing:'ease-out'});
  void animation.finished.catch(()=>{}).then(()=>banner.classList.remove('completion-celebrating'));
}
