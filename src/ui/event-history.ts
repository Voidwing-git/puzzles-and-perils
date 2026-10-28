import type {PrivatePreparation} from '../core/state.ts';

export function mountEventHistory(host:HTMLElement){
  const details=document.createElement('details');details.id='event-history';
  const summary=document.createElement('summary');summary.textContent='Event history';summary.setAttribute('aria-controls','event-history-panel');details.append(summary);host.append(details);
  const panel=document.createElement('section');panel.id='event-history-panel';panel.className='event-history-popover';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','GM event history');panel.tabIndex=-1;
  const heading=document.createElement('h3');heading.textContent='Event history';
  const empty=document.createElement('p');empty.textContent='No events yet.';empty.className='quiet';
  const list=document.createElement('ol');list.id='action-history';panel.append(heading,empty,list);document.body.append(panel);
  let visible=false,key='';
  const position=()=>{if(panel.hidden)return;const rect=summary.getBoundingClientRect(),width=Math.min(460,innerWidth*.9),top=Math.max(8,Math.min(rect.bottom+8,innerHeight-140));panel.style.left=Math.max(8,Math.min(rect.right-width,innerWidth-width-8))+'px';panel.style.top=top+'px';panel.style.maxHeight=Math.max(100,innerHeight-top-12)+'px';};
  details.addEventListener('toggle',()=>{panel.hidden=!visible||!details.open;if(!panel.hidden){const recovery=host.querySelector<HTMLDetailsElement>('#save-recovery');if(recovery)recovery.open=false;position();panel.focus({preventScroll:true});}});
  document.addEventListener('click',event=>{if(event.target instanceof Node&&!details.contains(event.target)&&!panel.contains(event.target))details.open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&details.open){event.preventDefault();details.open=false;summary.focus({preventScroll:true});}});
  window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
  return{update(isGM:boolean,preparation:PrivatePreparation|null){
    visible=isGM;details.hidden=!isGM;panel.hidden=!isGM||!details.open;
    if(!isGM){details.open=false;list.replaceChildren();key='';return;}
    const events=preparation?.actionHistory??[],nextKey=JSON.stringify(events);
    empty.hidden=events.length>0;
    if(nextKey!==key){key=nextKey;list.replaceChildren(...events.slice().reverse().map(event=>{
      const row=document.createElement('li'),description=document.createElement('p'),metadata=document.createElement('small');
      const name=event.name??preparation?.state.participants.find(p=>p.id===event.actor)?.name??'GM / room player';
      description.textContent=`${name} — ${event.detail??event.action.replaceAll('-',' ')}`;
      const date=event.at===undefined?null:new Date(event.at);
      metadata.textContent=`#${event.revision} · ${date&&Number.isFinite(date.getTime())?date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Earlier event'}`;
      row.append(description,metadata);return row;
    }));}
    position();
  }};
}
