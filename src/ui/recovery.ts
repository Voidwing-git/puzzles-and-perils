import {decodePrivateSave,encodePrivateSave,MAX_SAVE_BYTES} from '../core/save-format.ts';
import type {PrivatePreparation,PublicPuzzle} from '../core/state.ts';
import {mountEventHistory} from './event-history.ts';

export function mountRecovery(host:HTMLElement,options:{snapshot:()=>PublicPuzzle;preparation:()=>PrivatePreparation|null;restore:(p:PrivatePreparation)=>Promise<void>;command:(type:'undo'|'pause-puzzle'|'resume-puzzle')=>void;report:(message:string)=>void}){
  const root=document.createElement('div');root.className='recovery-controls';
  root.innerHTML='<button type="button" id="undo-puzzle" class="secondary-button">Undo</button><button type="button" id="pause-puzzle" class="secondary-button">Pause</button><details id="save-recovery"><summary>Save / recovery</summary><div class="recovery-popover"><button type="button" id="backup-private" class="secondary-button">Download private backup</button><button type="button" id="backup-public" class="secondary-button">Export public board</button><label>Import private backup<input id="import-private" type="file" accept=".json,application/json"/></label><div id="restore-review" hidden><p id="restore-description"></p><button type="button" id="restore-save" class="primary-button">Replace current puzzle with this save</button><button type="button" id="cancel-restore" class="text-button">Cancel</button></div><p class="quiet">Private backups include the solution, hidden pieces and undo history. Keep them with the GM.</p></div></details>';
  host.append(root);
  const eventHistory=mountEventHistory(root);
  // The toolbar scrolls horizontally; its overflow clips nested dropdowns.
  // Keep the recovery panel in a viewport portal, with controls still in the bar.
  const panel=root.querySelector<HTMLElement>('.recovery-popover')!;panel.hidden=true;panel.id='recovery-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Save and recovery');panel.tabIndex=-1;document.body.append(panel);
  const el=<T extends HTMLElement>(id:string)=>(root.querySelector<T>('#'+id)??panel.querySelector<T>('#'+id))!;
  const details=el<HTMLDetailsElement>('save-recovery'),summary=details.querySelector<HTMLElement>('summary')!;summary.setAttribute('aria-controls',panel.id);
  const position=()=>{if(panel.hidden)return;const rect=summary.getBoundingClientRect(),width=Math.min(360,innerWidth*.85),top=Math.max(8,Math.min(rect.bottom+8,innerHeight-140));panel.style.left=Math.max(8,Math.min(rect.right-width,innerWidth-width-8))+'px';panel.style.top=top+'px';panel.style.maxHeight=Math.max(100,innerHeight-top-12)+'px';};
  details.addEventListener('toggle',()=>{panel.hidden=!details.open||root.hidden;position();if(!panel.hidden)panel.focus({preventScroll:true});});
  document.addEventListener('click',event=>{const target=event.target;if(details.open&&target instanceof Node&&!root.contains(target)&&!panel.contains(target))details.open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&details.open){event.preventDefault();details.open=false;summary.focus({preventScroll:true});}});
  window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
  let pending:PrivatePreparation|null=null,busy=false;
  let reviewAnchor:{puzzleId:string;revision:number}|null=null;
  const download=(name:string,contents:string)=>{const url=URL.createObjectURL(new Blob([contents],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  el('undo-puzzle').onclick=()=>options.command('undo');
  el('pause-puzzle').onclick=()=>options.command(options.snapshot().paused?'resume-puzzle':'pause-puzzle');
  el('backup-private').onclick=()=>{try{const p=options.preparation();if(!p)throw new Error('Private preparation unavailable. Import a private backup to recover this puzzle.');download('arcane-pipes-private-backup.json',encodePrivateSave(p));}catch(error){options.report(error instanceof Error?error.message:String(error));}};
  el('backup-public').onclick=()=>{const p=options.snapshot();download('arcane-pipes-public-board.json',JSON.stringify({format:'arcane-pipes-public-save',version:1,puzzleId:p.puzzleId,puzzle:p},null,2));};
  el<HTMLInputElement>('import-private').onchange=async()=>{
    const input=el<HTMLInputElement>('import-private'),file=input.files?.[0];input.value='';pending=null;el('restore-review').hidden=true;
    if(!file||busy)return;
    try{if(file.size>MAX_SAVE_BYTES)throw new Error('Backup exceeds the supported 4 MB limit. Current puzzle kept.');pending=decodePrivateSave(await file.text());const current=options.snapshot();reviewAnchor={puzzleId:current.puzzleId,revision:current.revision};el('restore-description').textContent=`Restore "${pending.state.title}" (${pending.state.tiles.length} squares, revision ${pending.state.revision})? This replaces the current puzzle and retains this save's discoveries and starting layout.`;el('restore-review').hidden=false;}
    catch(error){options.report(error instanceof Error?error.message:String(error));}
  };
  el('cancel-restore').onclick=()=>{pending=null;el('restore-review').hidden=true;};
  el('restore-save').onclick=async()=>{
    if(!pending||busy)return;const p=pending;busy=true;el<HTMLButtonElement>('restore-save').disabled=true;
    try{const current=options.snapshot();if(!reviewAnchor||current.puzzleId!==reviewAnchor.puzzleId||current.revision!==reviewAnchor.revision)throw new Error('The board changed after this backup was reviewed. Import it again before replacing the puzzle.');await options.restore(p);pending=null;el('restore-review').hidden=true;options.report('Private backup restored.');}
    catch(error){options.report(error instanceof Error?error.message:String(error));}
    finally{busy=false;el<HTMLButtonElement>('restore-save').disabled=false;}
  };
  return {update(isGM:boolean,blocked:boolean,available:boolean){
    root.hidden=!isGM;panel.hidden=!isGM||!details.open;if(!isGM){eventHistory.update(false,null);return;}position();
    let p:PrivatePreparation|null=null;try{p=options.preparation();}catch{/* Recovery import remains available. */}
    el<HTMLButtonElement>('undo-puzzle').disabled=blocked||!available||!p?.history?.length;
    el<HTMLButtonElement>('pause-puzzle').disabled=blocked||!available;
    el('pause-puzzle').textContent=options.snapshot().paused?'Resume':'Pause';
    el<HTMLButtonElement>('backup-private').disabled=blocked||!p;
    el<HTMLButtonElement>('backup-public').disabled=blocked;
    el<HTMLInputElement>('import-private').disabled=blocked;
    el<HTMLButtonElement>('restore-save').disabled=blocked||busy;
    eventHistory.update(true,p);
  }};
}
