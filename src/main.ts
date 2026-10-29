import './security/host-guard.ts';
import './ui/style.css';
import {updateCompletionEffect} from './ui/completion-effect.ts';
import {renderGoals} from './ui/goal-status.ts';
import { installPuzzleFit } from './ui/viewport-fit.ts';
import { closePieceMenu, openPieceMenu, updatePieceMenu } from './ui/piece-menu.ts';
import { mountAuthoring } from './ui/authoring.ts';
import { rejectionMessages } from './core/commands.ts';
import { fixtureOptions } from './core/fixtures.ts';
import type { FixtureId } from './core/fixtures.ts';
import type { Command, PublicPuzzle } from './core/state.ts';
import { boardCoordinate, ports } from './core/pieces.ts';
import {cubeCell,cubeIndex,boardNeighbor} from './core/cube-topology.ts';
import {createCubeView} from './ui/cube-view.ts';
import { OwlbearAdapter } from './transport/owlbear-adapter.ts';
import { LocalAdapter } from './transport/local-adapter.ts';
import { directionNames, tileLabel, tileSvg, socketFractures } from './ui/tile.ts';
import { animateRotations } from './ui/rotation-animation.ts';
import {mountRecovery} from './ui/recovery.ts';

const sharedMode = window.parent !== window;
document.body.classList.toggle('embedded', sharedMode);
const adapter = sharedMode ? new OwlbearAdapter() : new LocalAdapter();
let snapshot = adapter.snapshot();
let selected: number | null = null;
let focusIndex = 0;
let activeFixture: FixtureId = 'relay';
let queuedActions = 0;
let queuedRotations = 0;
let rotationContext = '';
let rotationEpoch = 0;
let inputEpoch = 0;
let publishing = false;
let actionQueue = Promise.resolve();
let visualTransition = Promise.resolve();
let settingUp = false;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="demo-banner"><span class="demo-dot"></span><strong>Local demo · M3</strong><span>One browser, simulated players. Owlbear multiplayer qualification remains pending.</span></div>
  <main class="workspace">
    <header class="page-header">
      <div class="brand"><img src="${import.meta.env.BASE_URL}icon.svg" alt="" width="42" height="42"/><div><p class="eyebrow">A puzzle for your table</p><h1>Puzzles &amp; Perils</h1></div></div>
      <div class="header-note">Connect the source.<br/><span>Awaken the runes.</span></div>
    </header>
    <div id="gm-toolbar" class="gm-toolbar" hidden><strong id="view-label">GM view</strong><button id="edit-puzzle" class="secondary-button">Edit current puzzle</button><button id="open-setup" class="secondary-button">Make a puzzle</button><button id="return-gm" class="text-button" hidden>Back to GM view</button></div>
    <section id="waiting-screen" class="panel" hidden><h2>Puzzle unavailable</h2><p id="waiting-message" role="status">Connecting to Owlbear…</p></section>
    <section id="authoring" hidden aria-label="Make a puzzle"></section>
    <div id="play-screen" class="play-layout">

      <section class="board-panel" aria-labelledby="puzzle-title">
        <div class="board-heading"><div><p class="eyebrow">The conduit chamber</p><h2 id="puzzle-title"></h2></div><span class="board-seal" aria-hidden="true">✧</span></div>
        <p id="puzzle-description" class="puzzle-description"></p>
        <div class="board-frame"><div id="board" class="board" role="group" aria-label="Pipe puzzle board. Arrow keys navigate; Enter selects; Space or R rotates a selected tile. Tap to select; double-tap to rotate."></div></div>
        <div class="board-footer"><span><i class="legend-source" aria-hidden="true">◎</i> Source</span><span><i aria-hidden="true">◇</i> Azure</span><span><i class="legend-amber" aria-hidden="true">△</i> Amber</span><span><i aria-hidden="true">□</i> Verdant</span><span><i class="legend-power" aria-hidden="true">✦</i> Powered</span><span id="revision" class="revision"></span></div>
        <p id="power-warning" class="power-warning" role="status" hidden>Mixed currents! Separate azure ◇, amber △ and verdant □ networks.</p>
        <div id="success" class="success" role="status" hidden><span aria-hidden="true">✧</span><div><strong id="success-title">The runes are awakened</strong><p id="success-detail">Every target is connected. The chamber opens.</p></div></div>
        <section class="panel inventory-panel" aria-label="Player piece tray"><h3>Player piece tray</h3><p id="tray-status" role="status" aria-live="polite"></p><div id="piece-tray" class="piece-tray"></div><select hidden id="inventory" aria-label="Recovered piece"></select><button id="place-piece" class="secondary-button">Place in selected socket</button><p class="quiet">Drag a found piece onto an empty socket. Drops away from an empty socket return to the tray. You can also select a piece, select a socket, then use Place.</p></section>
      </section>
      <aside class="controls">
        <section class="panel turn-panel" aria-labelledby="turn-heading">
          <p class="eyebrow" id="turn-heading">At the table</p>
          <div class="turn-name"><span class="player-token" aria-hidden="true">✧</span><h2 id="active-player"></h2></div>
          <div class="turn-details"><span id="action-count"></span></div>
          <label for="viewer">Play as <span class="quiet">(local simulation)</span></label>
          <select id="viewer"><option value="lyra">Lyra</option><option value="orin">Orin</option><option value="spectator">Spectator</option></select>
          <p id="preview-note" class="quiet" hidden>Private preview - shared puzzle unchanged.</p>
          <p id="turn-hint" class="turn-hint"></p>
        </section>
        <section class="panel selection-panel" aria-labelledby="selection-title">
          <p class="eyebrow">Your move</p><h3 id="selection-title">Select a tile</h3>
          <p id="selection-detail" class="selection-detail">Inspect any socket, then rotate a piece on your turn.</p>
          <button id="rotate" class="primary-button" disabled><span aria-hidden="true">↻</span> Rotate 90° clockwise</button>
          <button id="next-turn" class="secondary-button end-turn-button">End turn →</button>
          <p class="keyboard-help">Tap to select · Double-tap/click to rotate · Space / R to rotate</p>
          <p id="feedback" class="feedback" role="status" aria-live="polite"></p>
        </section>

        <section class="panel host-panel" aria-labelledby="host-heading">
          <div class="host-heading"><h3 id="host-heading">Demo host</h3><span class="local-pill">LOCAL</span></div>
          <p class="quiet">End the turn to keep the chosen piece’s rotation. Switching pieces first restores the previous one.</p>
          <label class="mode-toggle"><input id="free-play" type="checkbox"/> Free play (turns off)</label>
          <p id="mode-detail" class="quiet">Changing modes keeps the current rotation.</p>
          <label for="fixture">Prepared board</label><select id="fixture">${fixtureOptions.map((option) => `<option value="${option.id}">${option.name}</option>`).join('')}</select>
          <button id="load-board" class="text-button">Load prepared board</button>
          <button id="gm-rotate" class="text-button">GM rotate selected piece</button><button id="recall-piece" class="text-button">GM return selected piece to tray</button><div id="shared-admin" hidden>
            <button id="sync-players" class="text-button">Use connected players</button>
            <button id="reset-puzzle" class="secondary-button">Reset puzzle</button>
            <button id="complete-puzzle" class="secondary-button">Auto-complete puzzle</button>
          </div>
        </section>
      </aside>
    </div>
    <footer class="page-footer"><span>Original arcane tiles · No timer · One piece per turn, unlimited rotations</span><span>Loose ends are allowed. Only matching openings carry energy.</span></footer>
  </main>`;

function element<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }
// Keep GM management above the shared play area.
const hostPanel = document.querySelector<HTMLElement>('.host-panel')!;
element('gm-toolbar').append(hostPanel);
const playControls = document.querySelector<HTMLElement>('.controls')!;
element('play-screen').prepend(playControls);
for (const [id, label] of [['edit-puzzle','Edit'],['open-setup','New puzzle'],['gm-rotate','Rotate piece'],['recall-piece','Return to tray'],['sync-players','Refresh players'],['reset-puzzle','Reset'],['complete-puzzle','Solve'],['rotate','Rotate']] as const) {
  const button = element<HTMLButtonElement>(id);
  button.setAttribute('aria-label', id === 'sync-players' ? 'Refresh players' : button.textContent!.trim());
  button.title = id === 'sync-players' ? 'Refresh turn order from currently connected Owlbear players; use a solo GM seat when none are connected.' : button.textContent!.trim();
  button.textContent = label;
}


// A shared left-hand order panel, central board and right-hand vertical tray.
const gameTable=document.createElement('div');gameTable.className='game-table';gameTable.id='game-table';
const orderPanel=document.createElement('aside');orderPanel.className='panel turn-order-panel';orderPanel.id='turn-order-panel';
orderPanel.setAttribute('aria-label','Turn order');
orderPanel.innerHTML='<h2>Turn order</h2>';
orderPanel.append(document.querySelector('.turn-panel')!);
const orderList=document.createElement('ol');orderList.id='turn-order-list';orderPanel.append(orderList);
orderPanel.append(element('free-play').closest('label')!,element('next-turn'));
const rosterEditor=document.createElement('div');rosterEditor.id='roster-editor';
rosterEditor.innerHTML='<label for="add-player">Add room player</label><select id="add-player" aria-label="Add room player"></select><button id="add-player-button" class="secondary-button">Add player</button>';
const syncPlayersButton=element('sync-players');
rosterEditor.append(syncPlayersButton);orderPanel.append(rosterEditor);
syncPlayersButton.textContent='Use all room players';
syncPlayersButton.title='Replace the puzzle order with all currently connected room players.';
const boardStage=document.createElement('div');boardStage.className='board-stage';
const boardPanel=document.querySelector<HTMLElement>('.board-panel')!;
const inventoryPanel=document.querySelector<HTMLElement>('.inventory-panel')!;
boardStage.append(boardPanel);gameTable.append(orderPanel,boardStage,inventoryPanel);element('play-screen').append(gameTable);
const goalsPanel=document.createElement('section');goalsPanel.id='goal-status-panel';goalsPanel.className='panel goal-status-panel';
goalsPanel.setAttribute('aria-label','Goal progress');
goalsPanel.innerHTML='<div id="goal-list" role="list" aria-label="Goals by power color"></div>';
playControls.prepend(goalsPanel);
const completionSlot=document.createElement('div');completionSlot.className='completion-slot';
completionSlot.append(element('success'));playControls.prepend(completionSlot);
element('success').insertAdjacentHTML('beforeend','<span class="completion-sparkles" aria-hidden="true"><i>✦</i><i>✧</i><i>✦</i></span>');
orderPanel.querySelector<HTMLElement>('.turn-details')!.hidden=true;

const board = element<HTMLDivElement>('board');
const cubeHost=document.createElement('div');cubeHost.id='cube-board';cubeHost.className='cube-viewport';cubeHost.hidden=true;
board.parentElement!.after(cubeHost);
const cubeControls=document.createElement('div');cubeControls.className='cube-controls';cubeControls.hidden=true;
cubeControls.innerHTML='<button type="button" id="cube-reset-view" class="text-button">Reset view</button><div id="cube-face-views" class="cube-face-views" aria-label="View cube face"></div><label>Square<select id="cube-square" aria-label="Cube square"><option value="">Select a square</option></select></label>';
cubeHost.after(cubeControls);
let cubeView:ReturnType<typeof createCubeView>|null=null;
let cubeOptionsKey='';
function selectCube(index:number){selected=index;focusIndex=index;render();enqueue('select',index);}
element('cube-reset-view').onclick=()=>cubeView?.resetCamera();
element<HTMLSelectElement>('cube-square').onchange=event=>{const value=(event.target as HTMLSelectElement).value;if(value!==''&&snapshot.cubeFaces){const index=Number(value);selectCube(index);cubeView?.focusFace(cubeCell(index,snapshot.width,snapshot.cubeFaces,snapshot.cubeDimensions).face);}};
cubeHost.oncontextmenu=event=>{
  const cell=cubeView?.pick(event.clientX,event.clientY);if(!cell||!snapshot.cubeFaces)return;
  event.preventDefault();const index=cubeIndex(cell,snapshot.width,snapshot.cubeFaces,snapshot.cubeDimensions);
  board.children[index]?.dispatchEvent(new MouseEvent('contextmenu',{clientX:event.clientX,clientY:event.clientY,cancelable:true}));
};
function renderCube(){
  const faces=snapshot.cubeFaces;
  board.parentElement!.hidden=!!faces;cubeHost.hidden=!faces;cubeControls.hidden=!faces;
  if(!faces){cubeView?.dispose();cubeView=null;return;}
  try{
    cubeView??=createCubeView(cubeHost,cell=>{if(snapshot.cubeFaces)selectCube(cubeIndex(cell,snapshot.width,snapshot.cubeFaces,snapshot.cubeDimensions));},cell=>{
      if(!snapshot.cubeFaces)return;selected=cubeIndex(cell,snapshot.width,snapshot.cubeFaces,snapshot.cubeDimensions);if(canRotate())enqueue('rotate',selected);
    });
    cubeView.update(faces,snapshot.width,snapshot.tiles.map((tile,index)=>({...cubeCell(index,snapshot.width,faces,snapshot.cubeDimensions),tile,powered:snapshot.powered.includes(index),energy:tile?.energy??snapshot.poweredBy[index]?.[0],mixed:snapshot.mixed.includes(index),fractured:snapshot.missingSockets?.includes(index)||snapshot.placements?.some(p=>p.tileIndex===index)})),selected===null?null:cubeCell(selected,snapshot.width,faces,snapshot.cubeDimensions),true,snapshot.cubeDimensions);
    const select=element<HTMLSelectElement>('cube-square');
    const key=snapshot.puzzleId+':'+faces.join(':')+':'+snapshot.width;
    if(key!==cubeOptionsKey){cubeOptionsKey=key;select.replaceChildren(new Option('Select a square',''),...snapshot.tiles.map((_,index)=>new Option(boardCoordinate(snapshot,index),String(index))));
      element('cube-face-views').replaceChildren(...faces.map(face=>{const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent=face;button.setAttribute('aria-label','View '+face+' face');button.onclick=()=>cubeView?.focusFace(face);return button;}));}
    select.value=selected===null?'':String(selected);
  }catch(error){feedback.textContent='3D view unavailable: '+(error instanceof Error?error.message:String(error));}
}
function matchTrayTileSize() {
  const size = snapshot.cubeFaces?Math.max(70,Math.min(120,cubeHost.clientWidth/snapshot.width*.65)):board.firstElementChild?.getBoundingClientRect().width;
  if (size) {element('piece-tray').style.setProperty('--tray-piece-size', `${size}px`);gameTable.style.setProperty('--tray-column-width',Math.max(innerWidth<=800?90:130,size+36)+'px');}
}
new ResizeObserver(matchTrayTileSize).observe(board);
const fitPuzzle = installPuzzleFit(matchTrayTileSize);
const rotate = element<HTMLButtonElement>('rotate');
const nextTurn = element<HTMLButtonElement>('next-turn');
const viewer = element<HTMLSelectElement>('viewer');
const fixture = element<HTMLSelectElement>('fixture');
const loadBoard = element<HTMLButtonElement>('load-board');
const feedback = element<HTMLParagraphElement>('feedback');
if(adapter instanceof LocalAdapter&&adapter.recoveryError)feedback.textContent=adapter.recoveryError;
const recovery=mountRecovery(element('gm-toolbar'),{
  snapshot:()=>snapshot,preparation:()=>adapter.privatePreparation(),command:type=>enqueue(type),report:message=>{feedback.textContent=message;},
  restore:async preparation=>{
    if(queuedActions||publishing||adapter.pending)throw new Error('Wait for the current action before restoring.');
    publishing=true;queuedActions++;render();
    try{const next=await adapter.restore(preparation);settingUp=false;editingCurrent=true;authoringMounted=false;await displaySnapshot(next);}
    finally{publishing=false;queuedActions--;render();}
  },
});
const freePlay = element<HTMLInputElement>('free-play');
let lastTouch = { index: -1, time: -Infinity };
let lastTap: { index: number; time: number } | null = null;
let touchStart: { index: number; pointer: number; x: number; y: number; time: number } | null = null;

function createBoard() {
board.replaceChildren();
for (let index = 0; index < snapshot.tiles.length; index++) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tile';
  button.dataset.index = String(index);
  button.addEventListener('focus', () => {
    focusIndex = index;
    updateTabStops();
  });
  button.addEventListener('click', (event) => {
    selected = index;
    render();
    enqueue('select', index);
    // A continuous four-click burst reports 1, 2, 3, 4. Some browsers emit
    // dblclick only for the first pair; count every completed pair ourselves.
    // Touch pointer-up already handles its pair, so ignore synthesized clicks.
    if(event.detail>0&&event.detail%2===0&&!(lastTouch.index===index&&performance.now()-lastTouch.time<700)){
      event.preventDefault();if(canRotate())enqueue('rotate',index);
    }
  });
  button.addEventListener('contextmenu', event => {
    const tile=snapshot.tiles[index]; if(!tile || tile.terminal) return;
    const placed=snapshot.placements?.find(p=>p.tileIndex===index);
    const provisional=snapshot.turnEdit?.tileIndex===index ? snapshot.turnEdit.placedPiece : undefined;
    const gm=!(adapter instanceof OwlbearAdapter) || (adapter.gm&&!adapter.preview);
    if(!placed && !provisional && !gm) return;
    event.preventDefault();
    const before=snapshot.puzzleId, revision=snapshot.revision;
    openPieceMenu(button,event.clientX,event.clientY,'Piece at '+boardCoordinate(snapshot,index),!canRecallPiece(),action=>{
      if(action!=='return'||snapshot.puzzleId!==before||snapshot.revision!==revision)return;
      const id=placed?.id??provisional;
      if(id)enqueue('return-piece',undefined,undefined,id);else enqueue('recall-piece',index);
    },'placed');
  });
  button.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    if (!event.isPrimary) { touchStart = null; lastTap = null; return; }
    touchStart = { index, pointer: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
  });
  button.addEventListener('pointercancel', () => { touchStart = null; lastTap = null; });
  button.addEventListener('pointerup', event => {
    if (event.pointerType !== 'touch') return;
    const now = performance.now();
    lastTouch = { index, time: now };
    const start = touchStart;
    touchStart = null;
    if (!start || start.index !== index || start.pointer !== event.pointerId ||
      now - start.time > 500 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) {
      lastTap = null;
      return;
    }
    if (lastTap?.index === index && now - lastTap.time <= 350) {
      lastTap = null;
      selected = index;
      if (canRotate()) enqueue('rotate', index);
    } else lastTap = { index, time: now };
  });
  board.append(button);
}
}

function updateTabStops() {
  Array.from(board.children).forEach((child, index) => { (child as HTMLButtonElement).tabIndex = index === focusIndex ? 0 : -1; });
}

function inputContext(){
  return JSON.stringify([snapshot.puzzleId,adapter.viewer,snapshot.participants[snapshot.activeIndex].id]);
}
function canRotate(): boolean {
  // A public update may arrive before its matching private save. Keep accepting
  // gestures for our already-authorized burst; each queued move still performs
  // fresh controller checks. An unrelated pending action grants no such buffer.
  const buffered=queuedRotations>0&&rotationEpoch===inputEpoch&&rotationContext===inputContext();
  return (!(adapter instanceof OwlbearAdapter) || ((adapter.available||buffered)&&(!adapter.pending||queuedActions>0))) && !snapshot.paused && !snapshot.solved &&
    (snapshot.mode==='free'?adapter.freePlayAllowed:snapshot.participants.some(player=>player.id===adapter.viewer)&&adapter.viewer===snapshot.participants[snapshot.activeIndex].id) && selected !== null &&
    snapshot.tiles[selected] !== null && !snapshot.tiles[selected]?.terminal;
}

function render() {
  if (board.children.length !== snapshot.tiles.length) { selected = null; focusIndex = 0; createBoard(); }
  board.style.gridTemplateColumns = `repeat(${snapshot.width}, minmax(0, 1fr))`;
  board.dataset.columns = String(snapshot.width);
  board.dataset.puzzle = snapshot.puzzleId;
  renderCube();
  renderAdventure();
  element('puzzle-title').textContent = snapshot.title;
  element('puzzle-description').textContent = fixtureOptions.find(option => option.name === snapshot.title)?.description ??
    'Connect every current to its matching target runes. Keep different currents separate.';
  Array.from(board.children).forEach((child, index) => {
    const button = child as HTMLButtonElement;
    const tile = snapshot.tiles[index];
    const svg = tileSvg(snapshot, index);
    // Selection/status renders must not destroy an in-flight tile animation.
    if (button.dataset.svg !== svg) {
      button.innerHTML = svg;
      button.dataset.svg = svg;
    }
    const energy = tile?.energy ?? snapshot.poweredBy[index]?.[0];
    button.className = ['tile', tile ? 'occupied' : 'empty', snapshot.powered.includes(index) ? 'powered' : '', energy === 'amber' ? 'amber' : energy === 'verdant' ? 'verdant' : '', snapshot.mixed.includes(index) ? 'mixed' : '', tile?.terminal ?? '', selected === index ? 'selected' : ''].filter(Boolean).join(' ');
    const placed = snapshot.placements?.some(p=>p.tileIndex===index) || (snapshot.turnEdit?.placedPiece && snapshot.turnEdit.tileIndex===index);
    const missing = !tile && snapshot.missingSockets?.includes(index);
    button.classList.toggle('replaced-tile',!!placed); button.classList.toggle('missing-tile',!!missing);
    const fractures=button.querySelector('.socket-fractures');
    if(!placed&&!missing)fractures?.remove();
    else if(!fractures)button.insertAdjacentHTML('beforeend',socketFractures());
    button.setAttribute('aria-label', tileLabel(snapshot, index));
    button.title = tileLabel(snapshot, index) + (placed ? ' · Replaced piece' : missing ? ' · Missing piece' : '');
    button.setAttribute('aria-pressed', String(selected === index));
  });
  updateTabStops();
  const current = snapshot.participants[snapshot.activeIndex];
  element('active-player').textContent = snapshot.paused?'Paused':snapshot.mode === 'free' ? 'Free play' : `${current.name}’s turn`;
  element('action-count').textContent = snapshot.mode === 'free' ? 'Unlimited pieces' : snapshot.turnEdit ? `Editing ${boardCoordinate(snapshot,snapshot.turnEdit.tileIndex)}` : 'Choose one piece';
  renderGoals(goalsPanel,snapshot);
  element('power-warning').hidden = snapshot.mixed.length === 0;
  element('revision').textContent = `Revision ${snapshot.revision}`;
  element('success').hidden = !snapshot.connected;
  element('success').dataset.solved=String(snapshot.solved);
  element('success-title').textContent = snapshot.solved ? 'The runes are awakened' : 'Both runes are connected';
  element('success-detail').textContent = snapshot.solved ? 'Every target is connected. The chamber opens.' : 'End the turn to confirm. You can still adjust your chosen piece.';
  updateCompletionEffect(element('success'),snapshot.puzzleId,snapshot.solved);
  element('turn-hint').textContent = snapshot.paused?'':snapshot.solved ? 'All runes are powered. Moves are locked.' :
    adapter.viewer === 'spectator' ? 'You are observing. Select a tile to inspect it.' :
      snapshot.mode === 'free' ? 'Rotate any piece. Every rotation stays on the board.' :
      adapter.viewer !== current.id ? `You are viewing as ${(viewer.selectedOptions[0]?.text ?? 'your Owlbear identity')}. Wait for ${current.name}.` :
        'Rotate your piece as often as you like. Selecting another restores the previous piece.';
  if (selected === null) {
    element('selection-title').textContent = 'Select a tile';
    element('selection-detail').textContent = 'Inspect any socket, then rotate a piece on your turn.';
  } else {
    const tile = snapshot.tiles[selected];
    const shape = tile ? (tile.terminal ?? (tile.shape === 'tee' ? 'T-junction' : tile.shape)) : 'empty socket';
    element('selection-title').textContent = `${boardCoordinate(snapshot,selected)} · ${shape}`;
    element('selection-detail').textContent = !tile ? 'No piece is present. Recover a piece, then select it from inventory to place it.' :
      `${tile.terminal ? `Fixed terminal (${tile.energy ?? 'azure'}). ` : ''}Openings: ${ports(tile).map((port) => directionNames[port]).join(', ')}. ${snapshot.mixed.includes(selected) ? 'Mixed energy — separate the currents.' : snapshot.powered.includes(selected) ? `✦ Powered from the source (${snapshot.poweredBy[selected][0]}).` : 'Not connected to the source.'}`;
  }
  if (adapter instanceof OwlbearAdapter) {
    document.querySelector('.demo-banner')!.textContent = `Puzzles & Perils 0.8.5 · ${adapter.preview ? 'PLAYER PREVIEW · Private rehearsal · Shared puzzle unchanged' : adapter.status}`;
    viewer.hidden = !adapter.gm;
    viewer.previousElementSibling!.textContent = adapter.gm ? 'View as' : 'Owlbear player';
    (viewer.previousElementSibling as HTMLElement).hidden = !adapter.gm;
    if (adapter.gm) {
      const options = [{ id: '__gm__', name: 'GM view (shared puzzle)' },
        ...adapter.viewOptions.map(p => ({ id: p.id, name: `Player preview: ${p.name}` })),
        { id: 'spectator', name: 'Player preview: Spectator' }];
      const key = JSON.stringify(options);
      if (viewer.dataset.options !== key) {
        viewer.replaceChildren(...options.map(p => { const option = document.createElement('option'); option.value = p.id; option.textContent = p.name; return option; }));
        viewer.dataset.options = key;
      }
      viewer.value = adapter.preview ? adapter.viewer : '__gm__';
    }
    element('preview-note').hidden = !adapter.preview;
    document.querySelector<HTMLElement>('.host-panel')!.hidden = !adapter.gm || adapter.preview || settingUp;
    fixture.hidden = snapshot.puzzleId !== 'waiting';
    (fixture.previousElementSibling as HTMLElement).hidden = fixture.hidden;
    Array.from(fixture.options).forEach(option => { option.hidden = option.value === 'broken-conduit'; });
    loadBoard.hidden = true;
    element('host-heading').textContent = 'GM controls';
    document.querySelector('.local-pill')!.textContent = 'GM';
    element('shared-admin').hidden = snapshot.puzzleId === 'waiting';
    for (const id of ['reset-puzzle', 'complete-puzzle', 'sync-players'])
      (element(id) as HTMLButtonElement).disabled = !!snapshot.paused || queuedActions > 0 || adapter.pending || !adapter.available;
    freePlay.closest('label')!.hidden = false;
  }
  rotate.disabled = queuedActions > 0 || !canRotate();
  const canEndTurn = !(adapter instanceof OwlbearAdapter) ||
    (adapter.gm && !adapter.preview) || adapter.viewer === current.id;
  nextTurn.disabled = !!snapshot.paused || (adapter instanceof OwlbearAdapter && !adapter.available) || !canEndTurn || queuedActions > 0 || adapter.pending || snapshot.solved || snapshot.mode === 'free';
  viewer.disabled = queuedActions > 0;
  fixture.disabled = queuedActions > 0;
  loadBoard.disabled = queuedActions > 0;
  freePlay.disabled = !!snapshot.paused || (adapter instanceof OwlbearAdapter && (!adapter.available || !adapter.gm || adapter.preview)) || queuedActions > 0 || adapter.pending;
  if (queuedActions === 0) freePlay.checked = snapshot.mode === 'free';
  rotate.setAttribute('aria-busy', String(queuedActions > 0));
  fitPuzzle();
}

function displaySnapshot(next: PublicPuzzle, clockwiseTile?: number): Promise<void> {
  const before = snapshot;
  if (before.puzzleId !== next.puzzleId || before.revision !== next.revision) closePieceMenu();
  if (before.puzzleId !== next.puzzleId) { selected = null; focusIndex = 0; }
  snapshot = next;
  render();
  // A metadata event may precede the request receipt. Animate the first
  // authoritative arrival; duplicate/status notifications keep that animation.
  if (before.puzzleId === next.puzzleId && before.revision === next.revision) return visualTransition;
  visualTransition = animateRotations(board, before, next, clockwiseTile);
  return visualTransition;
}

// Serialize click/select/double-click intents. A double-click on a new piece
// must wait for its selection rollback instead of being dropped as "pending".
function enqueue(type: Command['type'], tileIndex?: number, mode?: 'turns' | 'free', pieceId?: string, destination?: 'socket' | 'tray', playerIds?: string[]) {
  if (publishing) return;
  // Inspection needs no controller round trip unless it rolls back a turn edit.
  // Keep this check here and in send(): queued moves can change the edit state.
  if(type==='select'&&queuedActions===0&&(snapshot.paused||snapshot.mode==='free'||snapshot.solved||adapter.viewer!==snapshot.participants[snapshot.activeIndex].id||!snapshot.turnEdit||snapshot.turnEdit.tileIndex===tileIndex))return;
  const context=inputContext(),epoch=inputEpoch;
  if(type==='rotate'){
    if(queuedRotations===0||rotationEpoch!==epoch||rotationContext!==context){rotationContext=context;rotationEpoch=epoch;}
    queuedRotations++;
  }
  queuedActions++;
  render();
  actionQueue = actionQueue.then(async () => {
    try {
      // Do not replay old gestures into a replacement puzzle, another viewer's
      // turn, or after a rejected/uncertain action in the same burst.
      if((type==='rotate'||type==='select')&&(epoch!==inputEpoch||context!==inputContext()))return;
      await send(type, tileIndex, mode, pieceId, destination, playerIds);
    }
    finally { if(type==='rotate')queuedRotations--;queuedActions--; render(); }
  });
}

async function send(type: Command['type'], tileIndex?: number, mode?: 'turns' | 'free', pieceId?: string, destination?: 'socket' | 'tray', playerIds?: string[]) {
  if (type === 'select' && (snapshot.paused || snapshot.mode === 'free' || snapshot.solved ||
    adapter.viewer !== snapshot.participants[snapshot.activeIndex].id ||
    !snapshot.turnEdit || snapshot.turnEdit.tileIndex === tileIndex)) return;
  const expectedRevision = snapshot.revision;
  const puzzleId = snapshot.puzzleId;
  const command: Command = type === 'set-roster' ? {type,playerIds:playerIds!,expectedRevision,puzzleId}
    : type === 'place' ? { type, tileIndex: tileIndex!, pieceId: pieceId!, expectedRevision, puzzleId }
    : type === 'recover' ? { type, pieceId: pieceId!, ...(destination ? { destination } : {}), expectedRevision, puzzleId }
    : type === 'hide-piece' || type === 'return-piece' ? {type, pieceId:pieceId!,expectedRevision,puzzleId}
    : type === 'gm-rotate' || type === 'recall-piece' ? { type, tileIndex: tileIndex!, expectedRevision, puzzleId }
    : type === 'rotate' || type === 'select'
    ? { type, tileIndex: tileIndex!, expectedRevision, puzzleId }
    : type === 'set-mode' ? { type, mode: mode!, expectedRevision, puzzleId }
      : { type: type as 'advance-turn', expectedRevision, puzzleId };
  const asHost = type === 'advance-turn'
    ? !(adapter instanceof OwlbearAdapter) || (adapter.gm && !adapter.preview)
    : type === 'return-piece' ? adapter instanceof OwlbearAdapter && adapter.gm && !adapter.preview : type !== 'rotate' && type !== 'select' && type !== 'place';
  const request = adapter.request(command, asHost);
  feedback.textContent = sharedMode ? 'Submitting puzzle action…' : 'Submitting local action…';
  render();
  try {
    const result = await request;
    if(!result.accepted)inputEpoch++;
    await displaySnapshot(result.snapshot, result.accepted && type === 'rotate' ? tileIndex : undefined);
    if (result.accepted && type === 'return-piece' && pieceId)
      element<HTMLSelectElement>('inventory').value = pieceId;
    feedback.textContent = result.accepted
      ? type === 'gm-rotate' ? 'GM rotation committed.'
        : type === 'undo' ? 'Previous action undone.'
        : type === 'pause-puzzle' || type === 'resume-puzzle' ? ''
        : type === 'recall-piece' ? 'Selected piece returned to inventory.'
        : type === 'return-piece' ? 'Piece returned to tray.'
        : type === 'hide-piece' ? 'Piece hidden from players.'
        : type === 'recover' ? 'Piece found. Player tray and board updated.'
        : type === 'place' ? 'Piece placed. Rotate it or end your turn; switching restores it to inventory.'
        : type === 'reset-puzzle' ? 'This puzzle was reset to its starting rotations.'
        : type === 'complete-puzzle' ? ''
        : type === 'set-roster' ? 'Turn order updated.'
        : type === 'sync-players' ? 'Turn order: ' + snapshot.participants.map(p=>p.name).join(', ') + '.'
        : type === 'rotate' ? `${boardCoordinate(snapshot,tileIndex!)} rotated clockwise. ${snapshot.mode === 'free' ? 'Rotation kept.' : 'Keep rotating, or end the turn to keep this piece.'}`
        : type === 'select' ? 'Previous piece restored. Choose your new rotation.'
          : type === 'set-mode' ? `${snapshot.mode === 'free' ? 'Free play enabled' : 'Turns enabled'}. Current rotations kept.`
            : snapshot.solved ? 'Turn committed.' : `Rotation kept. Turn advanced to ${snapshot.participants[snapshot.activeIndex].name}.`
      : rejectionMessages[result.reason];
  } catch (error) {
    inputEpoch++;
    feedback.textContent = error instanceof Error ? error.message : 'The action could not complete.';
  }
  render();
}

rotate.addEventListener('click', () => { if (selected !== null) enqueue('rotate', selected); });
nextTurn.addEventListener('click', () => { enqueue('advance-turn'); });
freePlay.addEventListener('change', () => { enqueue('set-mode', undefined, freePlay.checked ? 'free' : 'turns'); });
viewer.addEventListener('change', () => { adapter.setViewer(viewer.value); render(); });
element('sync-players').addEventListener('click', () => enqueue('sync-players'));
element('reset-puzzle').addEventListener('click', () => {
  enqueue('reset-puzzle');
});
element('complete-puzzle').addEventListener('click', () => {
  enqueue('complete-puzzle');
});
loadBoard.addEventListener('click', () => {
  if (!window.confirm('Load this prepared board? Current local progress will be replaced.')) return;
  activeFixture = fixture.value as FixtureId;
  snapshot = adapter.load(activeFixture);
  selected = null;
  focusIndex = 0;
  feedback.textContent = 'Prepared board loaded. Lyra takes the first turn.';
  render();
});
board.addEventListener('keydown', (event) => {
  const movement: Record<string, number> = { ArrowUp: -snapshot.width, ArrowDown: snapshot.width, ArrowLeft: -1, ArrowRight: 1 };
  if (event.key in movement) {
    event.preventDefault();
    const direction=({ArrowUp:0,ArrowRight:1,ArrowDown:2,ArrowLeft:3} as const)[event.key as 'ArrowUp'];
    const next = snapshot.cubeFaces?boardNeighbor(snapshot,focusIndex,direction)?.index??-1:focusIndex + movement[event.key];
    if (next < 0 || next >= snapshot.tiles.length) return;
    if (!snapshot.cubeFaces&&(event.key === 'ArrowLeft' || event.key === 'ArrowRight') && Math.floor(next / snapshot.width) !== Math.floor(focusIndex / snapshot.width)) return;
    (board.children[next] as HTMLButtonElement).focus();
  } else if (event.key === ' ') {
    event.preventDefault();
    if (event.repeat) return;
    if (selected !== focusIndex) {
      selected = focusIndex;
      render();
      enqueue('select', focusIndex);
    } else if (canRotate()) enqueue('rotate', selected);
  } else if (event.key.toLowerCase() === 'r') {
    event.preventDefault();
    if (canRotate()) enqueue('rotate', selected!);
  }
});
// The cube canvas and empty space around either board share the same shortcut.
// Board buttons retain their existing keyboard selection/navigation behavior.
document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.key!==' '||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
  if(element('play-screen').hidden||selected===null)return;
  const target=event.target;
  if(target instanceof Element&&target.closest('input,textarea,select,button,a,summary,[contenteditable]:not([contenteditable="false"]),[role="menuitem"],[role="menu"],[role="dialog"]'))return;
  event.preventDefault();
  if(!event.repeat&&queuedActions===0&&canRotate())enqueue('rotate',selected);
});
let authoringMounted = false;
let disposeAuthoring:(()=>void)|undefined;
let editingCurrent = false;
function beginPieceDrag(event: PointerEvent, pieceId: string, card: HTMLButtonElement) {
  if (snapshot.paused || event.button !== 0 || queuedActions || publishing) return;
  const player = snapshot.mode==='free'?adapter.freePlayAllowed:snapshot.participants.some(p => p.id === adapter.viewer);
  if (!player || snapshot.solved || (snapshot.mode === 'turns' && snapshot.participants[snapshot.activeIndex].id !== adapter.viewer) ||
    (adapter instanceof OwlbearAdapter && !adapter.available)) return;
  event.preventDefault();
  const origin = card.getBoundingClientRect();
  const puzzleId = snapshot.puzzleId;
  const revision = snapshot.revision;
  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.classList.add('dragged-piece');
  ghost.style.width = `${origin.width}px`;
  ghost.style.height = `${origin.height}px`;
  ghost.style.left = `${origin.left}px`;
  ghost.style.top = `${origin.top}px`;
  document.body.append(ghost);
  card.classList.add('piece-picked-up');
  element<HTMLSelectElement>('inventory').value = pieceId;
  let moved = false;
  let pointerY = event.clientY;
  let scrolling = true;
  const scrollAtEdge = () => {
    if (!scrolling) return;
    if (moved && pointerY < 60) window.scrollBy(0, -14);
    else if (moved && pointerY > innerHeight - 60) window.scrollBy(0, 14);
    requestAnimationFrame(scrollAtEdge);
  };
  requestAnimationFrame(scrollAtEdge);
  const move = (e: PointerEvent) => {
    if (e.pointerId !== event.pointerId) return;
    pointerY = e.clientY;
    moved ||= Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) > 5;
    ghost.style.left = `${e.clientX - origin.width / 2}px`;
    ghost.style.top = `${e.clientY - origin.height / 2}px`;
  };
  const finish = (e: PointerEvent) => {
    if (e.pointerId !== event.pointerId) return;
    scrolling = false;
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', finish);
    document.removeEventListener('pointercancel', cancel);
    card.classList.remove('piece-picked-up');
    let target: number | undefined;
    let distance = Infinity;
    if (moved && e.type !== 'pointercancel' && snapshot.puzzleId === puzzleId && snapshot.revision === revision) {
      if(snapshot.cubeFaces){const hit=cubeView?.pick(e.clientX,e.clientY);if(hit){const index=cubeIndex(hit,snapshot.width,snapshot.cubeFaces,snapshot.cubeDimensions);if(!snapshot.tiles[index])target=index;}}
      else {
      [...board.children].forEach((child, index) => {
        if (snapshot.tiles[index]) return;
        const rect = child.getBoundingClientRect();
        if (e.clientX < rect.left - 12 || e.clientX > rect.right + 12 || e.clientY < rect.top - 12 || e.clientY > rect.bottom + 12) return;
        const next = Math.hypot(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
        if (next < distance) { target = index; distance = next; }
      });
      }
    }
    if (target !== undefined) {
      ghost.remove(); selected = target; enqueue('place', target, undefined, pieceId);
    } else if (moved) {
      const animation = ghost.animate([{ transform: 'translate(0, 0)' }, {
        transform: `translate(${origin.left - parseFloat(ghost.style.left)}px, ${origin.top - parseFloat(ghost.style.top)}px)`
      }], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180, easing: 'ease-out' });
      void animation.finished.finally(() => ghost.remove());
      feedback.textContent = 'Piece returned to tray. Drop near an empty socket to place it.';
    } else { ghost.remove(); card.click(); }
  };
  const cancel = (e: PointerEvent) => finish(e);
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', finish);
  document.addEventListener('pointercancel', cancel);
}
function setOrder(ids:string[]) {enqueue('set-roster',undefined,undefined,undefined,undefined,ids);}
function renderTurnOrder(isGM:boolean) {
  const busy=!!snapshot.paused || queuedActions>0 || adapter.pending || (adapter instanceof OwlbearAdapter && !adapter.available);
  const list=element('turn-order-list');
  list.replaceChildren(...snapshot.participants.map((player,index)=>{
    const row=document.createElement('li');row.dataset.playerId=player.id;
    if(snapshot.mode==='turns' && index===snapshot.activeIndex && !snapshot.solved){row.className='active-turn';row.setAttribute('aria-current','step');}
    const name=document.createElement('span');name.textContent=player.name;name.className='order-player-name';row.append(name);
    if(isGM){
      const tools=document.createElement('span');tools.className='order-actions';
      for(const [label,delta] of [['up',-1],['down',1],['remove',0]] as const){
        const button=document.createElement('button');button.type='button';button.textContent=label==='up'?String.fromCharCode(8593):label==='down'?String.fromCharCode(8595):String.fromCharCode(215);
        button.setAttribute('aria-label',label==='remove'?'Remove '+player.name:'Move '+player.name+' '+label);
        button.disabled=busy || (delta===-1 && index===0) || (delta===1 && index===snapshot.participants.length-1);
        button.onclick=()=>{const ids=snapshot.participants.map(p=>p.id);if(delta===0)ids.splice(index,1);else[ids[index],ids[index+delta]]=[ids[index+delta],ids[index]];setOrder(ids);};tools.append(button);
      }row.append(tools);
    }return row;
  }));
  element('roster-editor').hidden=!isGM;
  const select=element<HTMLSelectElement>('add-player');const previous=select.value;
  const candidates=adapter.roomPlayers.filter(player=>!snapshot.participants.some(p=>p.id===player.id));
  select.replaceChildren(...candidates.map(player=>{const option=document.createElement('option');option.value=player.id;option.textContent=player.name;return option;}));
  if(candidates.some(p=>p.id===previous))select.value=previous;
  if(!candidates.length){const empty=document.createElement('option');empty.value='';empty.textContent='No unlisted room players';select.append(empty);}
  select.disabled=busy || !candidates.length;
  const add=element<HTMLButtonElement>('add-player-button');add.disabled=busy || !select.value;
  add.onclick=()=>{if(!select.value)return;setOrder([...snapshot.participants.filter(p=>!p.name.includes('(solo')).map(p=>p.id),select.value]);};
}
function canRecallPiece() {
  if(snapshot.paused || queuedActions || publishing || (adapter instanceof OwlbearAdapter && !adapter.available))return false;
  if(adapter instanceof OwlbearAdapter && adapter.gm&&!adapter.preview)return true;
  return snapshot.mode==='free'?adapter.freePlayAllowed:snapshot.participants.some(p=>p.id===adapter.viewer)&&snapshot.participants[snapshot.activeIndex].id===adapter.viewer;
}
function renderAdventure() {
  const isGM = !(adapter instanceof OwlbearAdapter) || (adapter.gm && !adapter.preview);
  recovery.update(isGM,queuedActions>0||adapter.pending||publishing,adapter instanceof OwlbearAdapter?adapter.available:!adapter.recoveryError);
  updatePieceMenu(!!snapshot.paused || queuedActions > 0 || (adapter instanceof OwlbearAdapter && !adapter.available), !!snapshot.turnEdit);
  const finalized = !(adapter instanceof OwlbearAdapter) || adapter.finalized;
  const ready = !(adapter instanceof OwlbearAdapter) || adapter.ready;
  if (ready && isGM && !finalized) settingUp = true;
  const showSetup = ready && isGM && settingUp;
  element('gm-toolbar').hidden = !ready || !isGM;
  element('view-label').textContent = showSetup ? 'Puzzle setup · GM only' : 'GM view';
  element('open-setup').hidden = showSetup;
  element('edit-puzzle').hidden = showSetup || !finalized;
  element<HTMLButtonElement>('edit-puzzle').disabled = queuedActions > 0 || adapter.pending || !!snapshot.turnEdit;
  element('return-gm').hidden = !showSetup || !finalized;
  element<HTMLButtonElement>('return-gm').disabled = publishing;
  element<HTMLButtonElement>('open-setup').disabled = queuedActions > 0 || adapter.pending;
  element('play-screen').hidden = !ready || !finalized || showSetup;
  element('waiting-screen').hidden = ready && (showSetup || finalized);
  element('waiting-message').textContent = adapter instanceof OwlbearAdapter ? adapter.status : '';
  element('authoring').hidden = !showSetup;
  hostPanel.hidden = showSetup || !isGM;
  if (showSetup && !authoringMounted) {
    authoringMounted = true;
    disposeAuthoring?.();
    disposeAuthoring=mountAuthoring(element('authoring'), async draft => {
      if (queuedActions || adapter.pending) throw new Error('Wait for the current action before publishing.');
      publishing = true; queuedActions++; render();
      try {
        // Owlbear embeds this page cross-origin; browser confirm() can be
        // suppressed there. Save/Finalize is the explicit publication action.
        const next = await adapter.publish(draft);
        settingUp = false;
        await displaySnapshot(next);
      }
      finally { publishing = false; queuedActions--; render(); }
    }, adapter instanceof OwlbearAdapter ? adapter.privateScope : 'local', editingCurrent ? adapter.privatePreparation() ?? undefined : undefined);
  }
  for (const id of ['gm-rotate', 'recall-piece']) element<HTMLButtonElement>(id).disabled = !!snapshot.paused || !isGM || queuedActions > 0 || selected === null || !snapshot.tiles[selected] || !!snapshot.tiles[selected]?.terminal || !!snapshot.turnEdit || (adapter instanceof OwlbearAdapter && !adapter.available);
  let privatePieces: NonNullable<ReturnType<typeof adapter.privatePreparation>>['withheld'] = [];
  if (isGM) {
    try {
      const p = adapter.privatePreparation();
      privatePieces = [...(p?.withheld ?? []), ...(p?.hiddenInventory ?? []).map(h => ({id:h.id,index:h.origin?.index ?? -1,tile:h.tile,discoveryLabel:h.origin?.discoveryLabel ?? 'Recovered ' + h.tile.shape}))];
    }
    catch { feedback.textContent = 'Private preparation unavailable in this browser.'; }
  }
  const inventory = element<HTMLSelectElement>('inventory');
  const previous = inventory.value;
  inventory.replaceChildren(...(snapshot.inventory ?? []).map((p, index) => {
    const option = document.createElement('option'); option.value = p.id; option.textContent = `Piece ${index + 1} · ${p.tile.shape}`; return option;
  }));
  if ([...inventory.options].some(o => o.value === previous)) inventory.value = previous;
  element('tray-status').textContent = (snapshot.inventory?.length ?? 0) + ' available, ' + (snapshot.placements?.length ?? 0) + ' placed, ' + (snapshot.missingCount ?? 0) + ' hidden';
  const tray = element('piece-tray');
  matchTrayTileSize();
  tray.replaceChildren();
  for (let i = 0; i < (snapshot.missingCount ?? 0); i++) {
    const card = document.createElement('div');
    card.className = 'tray-piece unknown-piece';
    card.setAttribute('aria-label', 'Missing piece - not found');
    card.innerHTML = '<span aria-hidden="true">?</span><small>Missing</small>';
    const piece = isGM ? privatePieces[i] : undefined;
    if (piece) {
      card.title = piece.discoveryLabel;
      card.setAttribute('role', 'button'); card.tabIndex = 0;
      card.setAttribute('aria-label', 'Missing piece: ' + piece.discoveryLabel);
      card.setAttribute('aria-haspopup', 'menu');
      const open = (x: number, y: number) => {
        const puzzleId = snapshot.puzzleId, revision = snapshot.revision;
        openPieceMenu(card, x, y, piece.discoveryLabel,
          queuedActions > 0 || !!snapshot.turnEdit || (adapter instanceof OwlbearAdapter && !adapter.available),
          destination => {
            if (destination === 'hide' || destination === 'return') return;
            if (snapshot.puzzleId === puzzleId && snapshot.revision === revision)
              enqueue('recover', undefined, undefined, piece.id, destination);
          }, false, piece.index >= 0);
      };
      card.oncontextmenu = event => { event.preventDefault(); open(event.clientX, event.clientY); };
      card.onclick = () => { const rect = card.getBoundingClientRect(); open(rect.left, rect.bottom); };
      card.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault(); card.click();
        }
      };
    }
    tray.append(card);
  }
  for (const [index, piece] of (snapshot.inventory ?? []).entries()) {
    const button = document.createElement('button');
    button.className = 'tile tray-piece';
    button.dataset.pieceId = piece.id;
    button.title = 'Recovered ' + piece.tile.shape + ' - drag to an empty socket';
    button.setAttribute('aria-label', 'Pick up piece ' + (index + 1) + ', ' + piece.tile.shape);
    button.setAttribute('aria-pressed', String(inventory.value === piece.id));
    const preview = { ...snapshot, width: 1, tiles: [piece.tile], powered: [], poweredBy: [[]], mixed: [] };
    button.innerHTML = tileSvg(preview, 0) + '<small>Found</small>';
    button.onclick = () => {
      inventory.value = piece.id;
      tray.querySelectorAll('button').forEach(child => child.setAttribute('aria-pressed', String(child.dataset.pieceId === piece.id)));
    };
    button.onpointerdown = event => beginPieceDrag(event, piece.id, button);
    if (isGM) {
      button.setAttribute('aria-haspopup','menu');
      const open = (x:number,y:number) => {
        const puzzleId = snapshot.puzzleId, revision = snapshot.revision;
        openPieceMenu(button,x,y,'Recovered ' + piece.tile.shape,
          queuedActions > 0 || !!snapshot.turnEdit || (adapter instanceof OwlbearAdapter && !adapter.available),
          action => { if (action === 'hide' && snapshot.puzzleId === puzzleId && snapshot.revision === revision) enqueue('hide-piece',undefined,undefined,piece.id); },true);
      };
      button.oncontextmenu = event => {event.preventDefault();open(event.clientX,event.clientY);};
      button.onkeydown = event => { if(event.key === 'ContextMenu' || (event.shiftKey && event.key==='F10')) { event.preventDefault();const rect=button.getBoundingClientRect();open(rect.left,rect.bottom); } };
    }
    tray.append(button);
  }
  for(const placement of snapshot.placements ?? []) {
    const tile=snapshot.tiles[placement.tileIndex];if(!tile)continue;
    const ghost=document.createElement('div');ghost.className='tile tray-piece placed-piece';
    ghost.setAttribute('role','button');ghost.tabIndex=0;ghost.setAttribute('aria-disabled',String(!canRecallPiece()));
    ghost.setAttribute('aria-label','Recall placed piece at '+boardCoordinate(snapshot,placement.tileIndex));
    ghost.title='Placed at '+boardCoordinate(snapshot,placement.tileIndex)+' - click to recall';
    const preview={...snapshot,width:1,tiles:[tile],powered:[],poweredBy:[[]],mixed:[]};
    ghost.innerHTML=tileSvg(preview,0)+'<small>Placed - recall</small>';
    ghost.onclick=()=>{if(canRecallPiece())enqueue('return-piece',undefined,undefined,placement.id);else feedback.textContent='Wait for your turn to recall a piece.';};
    ghost.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();ghost.click();}};
    ghost.oncontextmenu=event=>{event.preventDefault();openPieceMenu(ghost,event.clientX,event.clientY,ghost.title,!canRecallPiece(),action=>{if(action==='return')ghost.click();},'placed');};
    tray.append(ghost);
  }
  renderTurnOrder(isGM);
  const participant = snapshot.mode==='free'?adapter.freePlayAllowed:snapshot.participants.some(p => p.id === adapter.viewer);
  element<HTMLButtonElement>('place-piece').disabled = !!snapshot.paused || queuedActions > 0 || !inventory.value || selected === null || !!snapshot.tiles[selected] ||
    snapshot.solved || !participant || (snapshot.mode === 'turns' && snapshot.participants[snapshot.activeIndex].id !== adapter.viewer) ||
    (adapter instanceof OwlbearAdapter && !adapter.available);
}
for (const type of ['gm-rotate', 'recall-piece'] as const) element(type).onclick = () => { if (selected !== null) enqueue(type, selected); };
element('open-setup').onclick = () => {
  authoringMounted = false;
  editingCurrent = false; settingUp = true; render();
};
element('edit-puzzle').onclick = () => {
  if (!adapter.privatePreparation()) { feedback.textContent = 'Private preparation unavailable in this browser. Open the original GM browser to edit this puzzle.'; return; }
  editingCurrent = true; authoringMounted = false; settingUp = true; render();
};
element('return-gm').onclick = () => { if (!publishing) { settingUp = false; render(); } };
element('place-piece').onclick = () => { if (selected !== null) enqueue('place', selected, undefined, element<HTMLSelectElement>('inventory').value); };
render();

if (adapter instanceof OwlbearAdapter) {
  const shared = adapter;
  shared.subscribe(() => {
    const next = shared.snapshot();
    void displaySnapshot(next);
  });
  void shared.connect().catch(error => {
    feedback.textContent = String(error);
    element('waiting-screen').hidden = false;
    element('waiting-message').textContent = `Could not open puzzle: ${String(error)}`;
  });
}
