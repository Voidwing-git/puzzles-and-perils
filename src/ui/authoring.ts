import { generate, withhold } from '../core/generator.ts';
import {generateCube} from '../core/cube-generator.ts';
import {cubeFaces,cubeCell,cubeIndex} from '../core/cube-topology.ts';
import type {CubeFace} from '../core/cube-topology.ts';
import {createCubeView} from './cube-view.ts';
import { createFixture, fixtureOptions } from '../core/fixtures.ts';
import type { FixtureId } from '../core/fixtures.ts';
import { readPrivate, savePrivate } from '../core/private-store.ts';
import {encodePrivateSave} from '../core/save-format.ts';
import { projectPublic } from '../core/projection.ts';
import { boardCoordinate } from '../core/pieces.ts';
import { tileSvg, tileLabel, socketFractures } from './tile.ts';
import type { PrivatePreparation } from '../core/state.ts';

// Nothing reaches the token until Finalize succeeds.
export function mountAuthoring(root: HTMLElement, finalize: (puzzle: PrivatePreparation) => Promise<void>, scope: string, initial?: PrivatePreparation) {
  root.innerHTML = `<div class="setup-heading"><p class="eyebrow">GM setup</p><h1>Make a puzzle</h1>
    <p>Choose the settings, review the preview, then finalize it for your players.</p></div>
    <div class="setup-layout"><section class="panel setup-settings" aria-label="Puzzle settings">
      <label>Puzzle layout<select id="setup-kind"><option value="generated">Generated puzzle</option><option value="cube">Cube surface</option><option value="dais">4 x 4 x 1 dais</option>${fixtureOptions.filter(p => p.id !== 'broken-conduit').map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
      <fieldset id="cube-face-settings" hidden><legend>Connected cube faces</legend>${cubeFaces.map(face=>`<label><input type="checkbox" value="${face}" ${face==='front'||face==='right'?'checked':''}/> ${face}</label>`).join('')}</fieldset>
      <div id="generator-settings"><label>Grid size<select id="draft-size"><option>4</option><option selected>5</option><option>6</option></select></label>
        <label>Power types<select id="draft-powers"><option>1</option><option>2</option><option>3</option></select></label>
        <label>Targets per type<select id="draft-targets"><option>1</option><option selected>2</option></select></label>
        <button id="generate-draft" class="secondary-button">Randomize</button>
        <p class="quiet">Try another layout with these settings. Randomizing replaces removed-piece choices in this preview.</p></div>
      <label>Missing-piece recovery<select id="draft-recovery"><option value="socket">Restore original sockets</option><option value="tray">Players place recovered pieces</option></select></label>
      <label class="mode-toggle"><input id="draft-free" type="checkbox" checked/> Free play (turns off)</label>

      <p class="quiet">Click an ordinary piece to move it to the creator tray. Select it there to add its name and GM notes.</p>
      <button id="publish-draft" class="primary-button">Finalize puzzle</button>
      <p id="draft-status" role="status" aria-live="polite"></p>
      <details class="setup-advanced"><summary>More options</summary>
        <label>Repeatable layout code<input id="draft-seed" maxlength="100"/></label>
        <button id="export-draft" class="text-button">Export private puzzle (spoilers)</button>
        <p class="quiet">Removed pieces are not guaranteed essential. Export contains the solution and discovery labels.</p>
      </details>
    </section><section class="setup-preview" aria-label="Puzzle preview" id="draft-controls">
      <div class="board-heading"><h2>Puzzle preview</h2><span id="draft-summary"></span></div>
      <label class="mode-toggle"><input id="draft-solution" type="checkbox"/> Show solution (GM only)</label>
      <div class="board-frame"><div id="draft-board" class="board private-board"></div></div>
      <div id="draft-cube" class="cube-viewport" hidden></div><div id="draft-cube-controls" class="cube-controls" hidden><button id="draft-camera" class="text-button">Reset view</button><div id="draft-face-views" class="cube-face-views"></div></div>
      <section class="panel creator-tray-panel" aria-label="Creator piece tray">
        <h3>Removed pieces</h3><div id="draft-tray" class="piece-tray"></div>
        <p id="draft-withheld" class="quiet">Select a removed piece to edit its information.</p>
        <div id="draft-piece-editor" hidden>
          <label>Piece name<input id="draft-label" maxlength="120"/></label>
          <label>GM notes<textarea id="draft-notes" maxlength="2000" rows="3"></textarea></label>
          <button id="draft-restore" class="secondary-button">Restore selected piece to board</button>
        </div>
      </section>
    </section></div>`;
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  let puzzle: PrivatePreparation | null = null;
  const editing = !!initial;
  if (editing) {
    root.querySelector('h1')!.textContent = 'Edit current puzzle';
    el('publish-draft').textContent = 'Save changes';
  }
  let selectedRemoved: number | null = null;
  let saved = false;
  let busy = false;
  let previousKind="generated";
  let cubeView:ReturnType<typeof createCubeView>|null=null;
  el<HTMLInputElement>('draft-seed').value = crypto.randomUUID();
  const report = (error: unknown) => { el('draft-status').textContent = error instanceof Error ? error.message : String(error); };
  function persist() {
    saved = false;
    if (!puzzle) return;
    try { savePrivate(`${scope}:working-draft`, puzzle); saved = true; el('draft-status').textContent = editing ? 'Changes saved privately. Click Save changes to update the players puzzle.' : 'Settings saved privately. Click Finalize puzzle to update the players puzzle.'; }
    catch (error) { report(error); }
  }
  function render() {
    if (!puzzle) return;
    el('draft-summary').textContent = `${puzzle.state.width} x ${puzzle.state.cubeFaces?puzzle.state.width:puzzle.state.height}${puzzle.state.cubeFaces?' / '+puzzle.state.cubeFaces.length+' faces':''} / ${puzzle.withheld.length} removed`;
    el('draft-withheld').textContent = puzzle.withheld.map(p => `${boardCoordinate(puzzle!.state,p.index)}: ${p.discoveryLabel}`).join(' / ');
    const solution = el<HTMLInputElement>('draft-solution').checked;
    const view = projectPublic(solution ? { ...puzzle, state: { ...puzzle.state, tiles: puzzle.solution } } : puzzle);
    const board = el('draft-board');
    board.parentElement!.hidden=!!view.cubeFaces;
    el('draft-cube').hidden=!view.cubeFaces;el('draft-cube-controls').hidden=!view.cubeFaces;
    if(view.cubeFaces){
      try{
        cubeView??=createCubeView(el('draft-cube'),cell=>{
          if(busy||el<HTMLInputElement>('draft-solution').checked||!puzzle?.state.cubeFaces)return;
          const index=cubeIndex(cell,puzzle.state.width,puzzle.state.cubeFaces,puzzle.state.cubeDimensions),tile=puzzle.state.tiles[index];
          if(tile?.terminal)return;
          if(tile)puzzle=withhold(puzzle,index,'Piece '+boardCoordinate(puzzle.state,index));
          selectedRemoved=index;persist();render();
        });
        cubeView.update(view.cubeFaces,view.width,view.tiles.map((tile,index)=>({...cubeCell(index,view.width,view.cubeFaces!,view.cubeDimensions),tile,powered:view.powered.includes(index),energy:tile?.energy??view.poweredBy[index]?.[0],mixed:view.mixed.includes(index),fractured:puzzle!.withheld.some(p=>p.index===index)})),null,false,view.cubeDimensions);
        el('draft-face-views').replaceChildren(...view.cubeFaces.map(face=>{const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent=face;button.setAttribute('aria-label','View '+face+' face');button.onclick=()=>cubeView?.focusFace(face);return button;}));
      }catch(error){report(error);}
    }else if(cubeView){cubeView.dispose();cubeView=null;}
    board.style.gridTemplateColumns = `repeat(${view.width}, minmax(0, 1fr))`;
    board.replaceChildren(...view.tiles.map((tile, index) => {
      const button = document.createElement('button'); button.type = 'button';
      button.className = `tile ${tile ? 'occupied' : 'empty'} ${tile?.energy ?? view.poweredBy[index]?.[0] ?? ''} ${view.powered.includes(index) ? 'powered' : ''}`;
      button.innerHTML = tileSvg(view, index);
      if(puzzle!.withheld.some(p=>p.index===index)){button.classList.add('missing-tile');button.insertAdjacentHTML('beforeend',socketFractures());}
      button.setAttribute('aria-label', `${tile ? 'Remove' : 'Restore'} ${tileLabel(view, index)}`);
      button.disabled = busy || solution || !!tile?.terminal;
      button.onclick = () => {
        try {
          if (tile) {puzzle = withhold(puzzle!, index, 'Piece '+boardCoordinate(puzzle!.state,index));selectedRemoved=index;}
          else {if(!puzzle!.withheld.some(p=>p.index===index))return;selectedRemoved=index;}
          persist(); render();
        } catch (error) { report(error); }
      };
      return button;
    }));
    const tray=el('draft-tray');
    tray.replaceChildren(...puzzle.withheld.map(piece=>{
      const button=document.createElement('button');button.type='button';button.className='tile tray-piece';button.dataset.removedIndex=String(piece.index);
      button.title=piece.discoveryLabel;button.setAttribute('aria-label','Edit removed piece '+piece.discoveryLabel);
      button.setAttribute('aria-pressed',String(selectedRemoved===piece.index));
      const preview={...view,width:1,tiles:[piece.tile],powered:[],poweredBy:[[]],mixed:[]};
      button.innerHTML=tileSvg(preview,0)+'<small>Removed</small>';
      button.onclick=()=>{selectedRemoved=piece.index;render();};return button;
    }));
    const piece=puzzle.withheld.find(p=>p.index===selectedRemoved);
    el('draft-piece-editor').hidden=!piece;
    if(piece){el<HTMLInputElement>('draft-label').value=piece.discoveryLabel;el<HTMLTextAreaElement>('draft-notes').value=piece.notes??'';}
    const size=board.firstElementChild?.getBoundingClientRect().width;
    if(size)tray.style.setProperty('--tray-piece-size',size+'px');
  }
  function rebuild(newCode = false) {
    if (busy) return;
    try {
      const kind = el<HTMLSelectElement>('setup-kind').value;
      const cube=kind==='cube'||kind==='dais';
      if(kind==='dais'&&previousKind!=='dais')for(const input of root.querySelectorAll<HTMLInputElement>('#cube-face-settings input'))input.checked=input.value!=='bottom';
      previousKind=kind;
      el('cube-face-settings').hidden=!cube;
      const sizeInput=el<HTMLSelectElement>('draft-size');
      sizeInput.closest('label')!.hidden=kind==='dais';if(kind==='dais')sizeInput.value='4';
      if(cube&&!sizeInput.querySelector('[value="3"]')){const option=new Option('3','3');sizeInput.prepend(option);}
      for(const option of sizeInput.options)option.hidden=cube?!['3','4'].includes(option.value):option.value==='3';
      if(cube&&!['3','4'].includes(sizeInput.value))sizeInput.value='3';
      if(!cube&&sizeInput.value==='3')sizeInput.value='4';
      const previousLayout = puzzle ? JSON.stringify(puzzle.solution) : '';
      let next: PrivatePreparation | null = null;
      for (let attempt = 0; attempt < 16; attempt++) {
        if (newCode) el<HTMLInputElement>('draft-seed').value = crypto.randomUUID();
        next = cube ? generateCube({...(kind==='dais'?{dimensions:{width:4,depth:4,height:1}}:{}),size:Number(sizeInput.value),faces:[...root.querySelectorAll<HTMLInputElement>('#cube-face-settings input:checked')].map(input=>input.value as CubeFace),powers:Number(el<HTMLSelectElement>('draft-powers').value),targets:Number(el<HTMLSelectElement>('draft-targets').value),seed:el<HTMLInputElement>('draft-seed').value},crypto.randomUUID()) : kind === 'generated' ? generate({ size: Number(el<HTMLSelectElement>('draft-size').value), powers: Number(el<HTMLSelectElement>('draft-powers').value),
          targets: Number(el<HTMLSelectElement>('draft-targets').value), seed: el<HTMLInputElement>('draft-seed').value }, crypto.randomUUID())
          : createFixture(kind as FixtureId, crypto.randomUUID());
        if (!newCode || kind !== 'generated' || JSON.stringify(next.solution) !== previousLayout) break;
        next = null;
      }
      if (!next) throw new Error('Could not create a different layout. Try Randomize again.');
      puzzle = next; selectedRemoved=null;
      el<HTMLButtonElement>('publish-draft').disabled=false;
      el('generator-settings').hidden = kind !== 'generated'&&!cube;
      el<HTMLInputElement>('draft-solution').checked = false;
      applyModes(); persist(); render();
    } catch (error) { el<HTMLButtonElement>('publish-draft').disabled=true; report(error); }
  }
  function applyModes() {
    if (!puzzle) return;
    puzzle.recoveryMode = el<HTMLSelectElement>('draft-recovery').value as 'socket' | 'tray';
    puzzle.state.mode = el<HTMLInputElement>('draft-free').checked ? 'free' : 'turns';
  }
  for(const id of ['draft-label','draft-notes']) el(id).oninput=()=>{
    const piece=puzzle?.withheld.find(p=>p.index===selectedRemoved);if(!piece||busy)return;
    piece.discoveryLabel=el<HTMLInputElement>('draft-label').value;
    piece.notes=el<HTMLTextAreaElement>('draft-notes').value;
    const card=root.querySelector<HTMLElement>('[data-removed-index="'+piece.index+'"]');
    if(card){card.title=piece.discoveryLabel;card.setAttribute('aria-label','Edit removed piece '+piece.discoveryLabel);}
    persist();
  };
  el('draft-restore').onclick=()=>{
    const piece=puzzle?.withheld.find(p=>p.index===selectedRemoved);if(!piece||busy)return;
    puzzle!.state.tiles[piece.index]={...piece.tile};puzzle!.withheld=puzzle!.withheld.filter(p=>p.index!==piece.index);
    selectedRemoved=null;persist();render();
  };
  const trayObserver=new ResizeObserver(()=>{
    const size=el('draft-board').firstElementChild?.getBoundingClientRect().width;
    if(size)el('draft-tray').style.setProperty('--tray-piece-size',size+'px');
  });trayObserver.observe(el('draft-board'));
  el('generate-draft').onclick = () => rebuild(true);
  el('draft-camera').onclick=()=>cubeView?.resetCamera();
  el('cube-face-settings').onchange=()=>rebuild();
  for (const id of ['setup-kind', 'draft-size', 'draft-powers', 'draft-targets', 'draft-seed']) el(id).onchange = () => rebuild();
  for (const id of ['draft-recovery', 'draft-free']) el(id).onchange = () => { if (!busy) { applyModes(); persist(); } };
  el('draft-solution').onchange = render;
  el('export-draft').onclick = () => {
    if (!puzzle) return;
    const draft=structuredClone(puzzle);draft.startingState=structuredClone(draft.state);draft.startingWithheld=structuredClone(draft.withheld);draft.history=[];draft.actionHistory=[];
    let encoded:string;try{encoded=encodePrivateSave(draft);}catch(error){report(error);return;}
    const url = URL.createObjectURL(new Blob([encoded], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'arcane-pipes-private-puzzle-SPOILERS.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  el('publish-draft').onclick = async () => {
    if (!puzzle || busy) return;
    persist(); if (!saved) return;
    busy = true;
    const inputs = root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement>('input,select,button,textarea');
    inputs.forEach(input => { input.disabled = true; });
    el('draft-status').textContent = 'Finalizing puzzle…';
    try {
      const finalized = structuredClone(puzzle); finalized.state.puzzleId = crypto.randomUUID();
      await finalize(finalized);
      el('draft-status').textContent = 'Puzzle finalized. Players can now open it from the token.';
    } catch (error) { report(error); }
    finally { busy = false; inputs.forEach(input => { input.disabled = false; }); render(); }
  };
  try {
    puzzle = initial ? structuredClone(initial) : readPrivate(`${scope}:working-draft`);
    if(puzzle&&!editing)puzzle.state.mode='free';
    if (puzzle) {
      if(puzzle.state.cubeFaces){el<HTMLSelectElement>('setup-kind').value=puzzle.state.cubeDimensions?'dais':'cube';previousKind=el<HTMLSelectElement>('setup-kind').value;el<HTMLSelectElement>('draft-size').closest('label')!.hidden=!!puzzle.state.cubeDimensions;el('cube-face-settings').hidden=false;el<HTMLSelectElement>('draft-size').prepend(new Option('3','3'));for(const input of root.querySelectorAll<HTMLInputElement>('#cube-face-settings input'))input.checked=puzzle.state.cubeFaces.includes(input.value as CubeFace);}
      el<HTMLSelectElement>('draft-size').value = String(puzzle.state.width);
      if(puzzle.state.cubeFaces)for(const option of el<HTMLSelectElement>('draft-size').options)option.hidden=!['3','4'].includes(option.value);
      el<HTMLSelectElement>('draft-powers').value = String(puzzle.solution.filter(t => t?.terminal === 'source').length);
      el<HTMLSelectElement>('draft-targets').value = String(puzzle.solution.filter(t => t?.terminal === 'target').length / puzzle.solution.filter(t => t?.terminal === 'source').length);
      el<HTMLInputElement>('draft-seed').value = puzzle.seed;
      el<HTMLSelectElement>('draft-recovery').value = puzzle.recoveryMode ?? 'socket';
      el<HTMLInputElement>('draft-free').checked = puzzle.state.mode === 'free';
      const fixture = fixtureOptions.find(p => p.name === puzzle!.state.title);
      if (fixture) el<HTMLSelectElement>('setup-kind').value = fixture.id;
      el('generator-settings').hidden = !!fixture; render();
    } else rebuild();
  } catch (error) { rebuild(); report(error); }
  return ()=>{trayObserver.disconnect();cubeView?.dispose();cubeView=null;};
}
