import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { PrivatePreparation } from '../src/core/state.ts';

// Local SDK host double. Public UI routes are real compiled code; Owlbear's
// networking/identity/storage guarantees still require the real-room gate.
test('token context entry, solo GM, private player rehearsal and isolated reset/complete', async ({ page }) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  // The host double keeps both clients onscreen to avoid offscreen iframe
  // timer/animation throttling. Each product popup retains its normal size.
  await page.setViewportSize({width:1600,height:4500});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(() => {
    const original = Element.prototype.animate;
    Element.prototype.animate = function(this: Element, ...args: Parameters<Element['animate']>) {
      const animation = original.apply(this, args);
      const tile = this.closest<HTMLElement>('[data-index]');
      if (tile && this.matches('.rotating-piece')) {
        const frames = (animation.effect as KeyframeEffect).getKeyframes();
        tile.dataset.animationCount = String(Number(tile.dataset.animationCount ?? 0) + 1);
        tile.dataset.animationFrom = String(frames[0].transform);
        tile.dataset.animationTo = String(frames.at(-1)!.transform);
        tile.dataset.animationDuration = String(animation.effect!.getTiming().duration);
        tile.dataset.coordinateTransform = getComputedStyle(tile.querySelector('.tile-coordinate')!).transform;
      }
      return animation;
    };
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/token-harness', route => route.fulfill({ contentType: 'text/html', body: '<html><body><h1>Local SDK token host double</h1></body></html>' }));
  const extensionOrigin='https://arcane-pipes.test';
  const localBase=test.info().project.use.baseURL!;
  await page.route(extensionOrigin+'/**',async route=>{const url=new URL(route.request().url());const response=await page.request.get(new URL(url.pathname+url.search,localBase).href);await route.fulfill({response});});
  // Intercepted host double only: no live Owlbear room or service is contacted.
  await page.goto('https://www.owlbear.rodeo/token-harness');
  await page.evaluate((extensionOrigin) => {
    const KEY = 'com.arcane-pipes/shared-v1';
    const TOKEN = 'com.arcane-pipes/token-v1';
    const ENTRY = 'com.arcane-pipes/token';
    type Peer = { id: string; connectionId: string; role: 'GM'|'PLAYER'; name: string };
    type Frame = { frame: HTMLIFrameElement; peer: Peer; channel?: string };
    const gm: Peer = { id: 'gm', connectionId: 'g', role: 'GM', name: 'GM' };
    const player: Peer = { id: 'player', connectionId: 'p', role: 'PLAYER', name: 'Player' };
    const peers: Peer[] = [gm];
    const frames: Frame[] = [];
    let sceneReady=true,reconnections=0;
    const tokens: { id: string; type: string; name: string; metadata: Record<string, unknown> }[] = [
      { id: 'token-a', type: 'IMAGE', name: 'Puzzle A', metadata: { unrelated: 'keep-a' } },
      { id: 'token-b', type: 'IMAGE', name: 'Puzzle B', metadata: { unrelated: 'keep-b' } },
    ];
    const send = (frame: HTMLIFrameElement, id: string, data: unknown) => frame.contentWindow?.postMessage({ id, data }, extensionOrigin);
    const mount = (name: string, url: string, peer: Peer, hidden = false) => {
      document.getElementById(name)?.remove();
      const frame = document.createElement('iframe'); frame.id = name;
      frame.width = '1200'; frame.height = '1800'; frame.hidden = hidden;
      frame.style.display = hidden ? 'none' : 'block';
      const src = new URL(url, extensionOrigin); src.searchParams.set('obrref', btoa(location.origin + ' token-room'));
      frame.src = src.href;
      frame.onload = () => send(frame, 'OBR_READY', { ref: name, userId: peer.id });
      frames.push({ frame, peer }); document.body.append(frame);
      return frame;
    };
    const buttons = new Map<string, HTMLButtonElement>();
    const button = (name: string, click: () => void) => {
      const b = document.createElement('button'); b.textContent = name; b.disabled = true; b.onclick = click;
      document.body.append(b); buttons.set(name, b); return b;
    };
    const context = (tokenId: string) => ({ items: [tokens.find(t => t.id === tokenId)], selectionBounds: {} });
    const trigger = (peer: Peer, action: string, tokenId: string) => {
      const bg = frames.find(f => f.frame.id === `${peer.id}-background` && f.frame.isConnected)!;
      send(bg.frame, 'OBR_CONTEXT_MENU_EVENT_CLICK', { id: ENTRY+'/'+action, context: context(tokenId), elementId: 'test' });
    };
    for (const id of ['a', 'b']) button(`Make puzzle ${id.toUpperCase()}`, () => trigger(gm, 'attach', 'token-'+id));
    button('Open puzzle A', () => trigger(gm, 'open', 'token-a'));
    button('Open puzzle B', () => trigger(gm, 'open', 'token-b'));
    button('Player opens puzzle A', () => trigger(player, 'open', 'token-a'));
    button('Double-click puzzle B with puzzle tool', () => {
      const bg = frames.find(f => f.frame.id === 'gm-background')!;
      send(bg.frame, 'OBR_TOOL_MODE_EVENT_TOOL_DOUBLE_CLICK', { id: ENTRY+'/mode', context: {}, event: { target: tokens[1], pointerPosition: {x:0,y:0} } });
    });
    const join = button('Join test player', () => {
      peers.push(player); mount('player-background', '/background.html', player, true);
      frames.forEach(f => send(f.frame, 'OBR_PARTY_EVENT_CHANGE', {players:peers.filter(p=>p.connectionId!==f.peer.connectionId)}));
    }); join.disabled = false;
    const joinSecond=button('Join second test player',()=>{
      peers.push({id:'second-player',connectionId:'p2',role:'PLAYER',name:'Second player'});
      frames.filter(f=>f.frame.isConnected).forEach(f=>send(f.frame,'OBR_PARTY_EVENT_CHANGE',{players:peers.filter(p=>p.connectionId!==f.peer.connectionId)}));
    });joinSecond.disabled=false;
    const reconnect = button('Reconnect GM controller', () => {
      document.getElementById('gm-window')?.remove();
      document.getElementById('gm-background')?.remove();
      gm.connectionId = 'g-reconnected-'+(++reconnections);
      mount('gm-background', '/background.html', gm, true);
    }); reconnect.disabled = false;
    const duplicate = button('Toggle extra GM connection', () => {
      const existing = peers.findIndex(p => p.connectionId === 'extra-gm');
      if (existing >= 0) peers.splice(existing, 1);
      else peers.push({id:'gm-extra',connectionId:'extra-gm',role:'GM',name:'Extra GM'});
      frames.filter(f=>f.frame.isConnected).forEach(f=>send(f.frame,'OBR_PARTY_EVENT_CHANGE',{players:peers.filter(p=>p.connectionId!==f.peer.connectionId)}));
    }); duplicate.disabled = false;
    const sceneButton=button('Toggle test scene',()=>{sceneReady=!sceneReady;frames.filter(f=>f.frame.isConnected).forEach(f=>send(f.frame,'OBR_SCENE_EVENT_READY_CHANGE',{ready:sceneReady}));});sceneButton.disabled=false;
    window.addEventListener('message', event => {
      const source = frames.find(f => f.frame.contentWindow === event.source);
      if (!source || !event.data?.id) return;
      const {id, data, nonce} = event.data;
      let response: unknown = {};
      if (id === 'OBR_PLAYER_GET_ROLE') response = {role:source.peer.role};
      else if (id === 'OBR_PLAYER_GET_CONNECTION_ID') response = {connectionId:source.peer.connectionId};
      else if (id === 'OBR_PLAYER_GET_NAME') response = {name:source.peer.name};
      else if (id === 'OBR_VIEWPORT_GET_WIDTH') response = {width:1600};
      else if (id === 'OBR_VIEWPORT_GET_HEIGHT') response = {height:1100};
      else if (id === 'OBR_PARTY_GET_PLAYERS') response = {players:peers.filter(p=>p.connectionId!==source.peer.connectionId)};
      else if (id === 'OBR_SCENE_IS_READY') response = {ready:sceneReady};
      else if (id === 'OBR_SCENE_ITEMS_GET_ALL_ITEMS') response = {items:tokens};
      else if (id === 'OBR_SCENE_ITEMS_UPDATE_ITEMS') {
        for (const update of data.updates) Object.assign(tokens.find(t=>t.id===update.id)!, update);
        frames.forEach(f=>send(f.frame,'OBR_SCENE_ITEMS_EVENT_CHANGE',{items:tokens}));
        const output = document.getElementById('state') ?? document.body.appendChild(Object.assign(document.createElement('pre'), {id:'state'}));
        output.textContent = JSON.stringify(tokens.map(t=>({id:t.id, metadata:t.metadata})));
      } else if (id === 'OBR_CONTEXT_MENU_CREATE') {
        if (source.peer.role === 'GM' && data.id === ENTRY+'/attach')
          for (const name of ['Make puzzle A','Make puzzle B']) buttons.get(name)!.disabled = false;
        if (data.id === ENTRY+'/open') {
          if (source.peer.role === 'GM') for (const name of ['Open puzzle A','Open puzzle B']) buttons.get(name)!.disabled = false;
          else buttons.get('Player opens puzzle A')!.disabled = false;
        }
      } else if (id === 'OBR_TOOL_MODE_CREATE') buttons.get('Double-click puzzle B with puzzle tool')!.disabled = false;
      else if (id === 'OBR_POPOVER_OPEN') {
        const frame = mount(`${source.peer.id}-window`, data.url, source.peer);
        frame.width = String(data.width); frame.height = String(data.height);
        frame.dataset.popoverWidth = String(data.width); frame.dataset.popoverHeight = String(data.height);
      }
      else if (id === 'OBR_BROADCAST_SUBSCRIBE') source.channel = data.channel;
      else if (id === 'OBR_BROADCAST_SEND_MESSAGE') {
        const log = document.getElementById('messages') ?? document.body.appendChild(Object.assign(document.createElement('pre'), {id:'messages'}));
        log.textContent += JSON.stringify(data.data) + '\n';
        frames.filter(f=>f.channel===data.channel && f.frame.isConnected).forEach(f=>send(f.frame,`OBR_BROADCAST_MESSAGE_${data.channel}`,{data:data.data,connectionId:source.peer.connectionId}));
      }
      else if (id === 'OBR_ROOM_GET_METADATA') response = {metadata:{}};
      if (nonce) send(source.frame, `${id}_RESPONSE${nonce}`, response);
    });
    mount('gm-background', '/background.html', gm, true);
    // Keep these names reachable only through visible diagnostic output.
    void KEY; void TOKEN;
  },extensionOrigin);
  const gm = page.frameLocator('#gm-window');
  // Keyboard activation keeps the synthetic host controls reliable when a
  // large cross-origin popup has focus. These controls are not product UI.
  const hostAction=async(name:string)=>{
    const opens=/^(?:Make puzzle|Open puzzle|Double-click puzzle|Player opens)/.test(name);
    const frame=page.locator(name.startsWith('Player opens')?'#player-window':'#gm-window');
    const previous=opens&&await frame.count()?await frame.elementHandle():null;
    const button=page.getByRole('button',{name,exact:true});await expect(button).toBeEnabled();await button.press('Enter');
    if(opens){if(previous)await expect.poll(()=>previous.evaluate(el=>el.isConnected)).toBe(false);await expect(frame).toBeVisible();}
  };
  await hostAction('Make puzzle A');
  await expect(gm.getByRole('heading', {name:'Make a puzzle',exact:true})).toBeVisible();
  await expect(gm.locator('#draft-size')).toBeEnabled();
  await expect(gm.locator('#draft-board button')).toHaveCount(25);
  await expect(gm.locator('#play-screen')).toBeHidden();
  await expect(page.locator('#state')).toHaveCount(0);
  await page.locator('#gm-window').screenshot({path:'docs/evidence/m3-make-puzzle-settings.png'});
  await gm.locator('#setup-kind').selectOption('relay');
  await gm.getByRole('button',{name:'Finalize puzzle',exact:true}).click();
  await expect(gm.locator('#active-player')).toHaveText('GM (solo GM seat)’s turn');
  await gm.locator('#viewer').selectOption('gm');
  await expect(gm.locator('#preview-note')).toBeVisible();
  await expect(gm.locator('#shared-admin')).toBeHidden();
  await gm.locator('[data-index="6"]').dblclick();
  await expect(gm.locator('#revision')).toHaveText('Revision 1');
  await expect(gm.locator('#rotate')).toBeEnabled();
  await expect(gm.locator('#next-turn')).toBeEnabled();
  await gm.locator('#next-turn').click();
  await expect(gm.locator('#revision')).toHaveText('Revision 2');
  await gm.locator('body').screenshot({path:'docs/evidence/m2-player-preview-host-double.png'});
  await gm.locator('#viewer').selectOption('spectator');
  await expect(gm.locator('#rotate')).toBeDisabled();
  await gm.locator('#viewer').selectOption('__gm__');
  await expect(gm.locator('#revision')).toHaveText('Revision 0');
  await hostAction('Make puzzle B');
  await expect(page.locator('#gm-window')).toHaveAttribute('src',/token=token-b/);
  await expect(gm.getByRole('heading',{name:'Make a puzzle',exact:true})).toBeVisible();
  await gm.locator('#setup-kind').selectOption('dual-power');
  await gm.getByRole('button',{name:'Finalize puzzle',exact:true}).click();
  await expect(gm.locator('#puzzle-title')).toHaveText('The twin currents');
  await hostAction('Open puzzle A');
  await expect(gm.locator('#puzzle-title')).toHaveText('The arcane relay');
  await gm.locator('#complete-puzzle').click();
  await expect(gm.locator('#success')).toBeVisible();
  await expect(gm.locator('#success[data-solved="true"]')).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await gm.locator('#reset-puzzle').click();
  await expect(gm.locator('#active-player')).toContainText('solo GM seat');
  await expect(gm.locator('#revision')).toHaveText('Revision 2');
  await hostAction('Double-click puzzle B with puzzle tool');
  await expect(gm.locator('#revision')).toHaveText('Revision 0');
  await expect(gm.locator('#puzzle-title')).toHaveText('The twin currents');
  await hostAction('Join test player');
  await hostAction('Player opens puzzle A');
  const player = page.frameLocator('#player-window');
  await expect(player.locator('#viewer')).toBeHidden();
  await expect(player.locator('.host-panel')).toBeHidden();
  await hostAction('Open puzzle A');
  await gm.locator('#sync-players').click();
  await expect(player.locator('#active-player')).toHaveText('Player’s turn');
  await player.locator('[data-index="6"]').dblclick();
  await expect(gm.locator('#revision')).toHaveText('Revision 4');
  await expect(player.locator('#rotate')).toBeEnabled();
  await expect(gm.locator('#sync-players')).toBeEnabled();
  for (const view of [gm, player]) {
    const rotated = view.locator('[data-index="6"]');
    await expect(rotated).toHaveAttribute('data-animation-count','1');
    await expect(rotated).toHaveAttribute('data-animation-from','rotate(-90deg)');
    await expect(rotated).toHaveAttribute('data-animation-to','rotate(0deg)');
    await expect(rotated).toHaveAttribute('data-animation-duration','160');
    await expect(rotated).toHaveAttribute('data-coordinate-transform','none');
  }
  await expect(player.locator('#next-turn')).toBeEnabled();
  await player.locator('#next-turn').click();
  await expect(player.locator('#revision')).toHaveText('Revision 5');
  await expect(gm.locator('#revision')).toHaveText('Revision 5');
  for (const view of [gm, player]) await expect(view.locator('[data-index="6"]')).toHaveAttribute('data-animation-count','1');
  await expect(player.locator('.page-header')).toBeHidden();
  await expect(player.locator('#puzzle-description')).toBeHidden();
  await expect(page.locator('#player-window')).toHaveAttribute('data-popover-width', '1160');
  await expect(page.locator('#player-window')).toHaveAttribute('data-popover-height', '1036');
  await expect(page.locator('#state')).toContainText('keep-a');
  await expect(page.locator('#state')).toContainText('keep-b');
  await gm.locator('body').screenshot({path:'docs/evidence/m2-token-host-double.png'});
  await player.locator('body').screenshot({path:'docs/evidence/m2-token-player-host-double.png'});
  // M3: use the token's real compiled GM/player UI and SDK controller path.
  await gm.locator('#open-setup').click();
  await gm.locator('#setup-kind').selectOption('generated');
  await gm.locator('#draft-size').selectOption('4');
  await gm.getByText('More options', {exact:true}).click();
  await gm.locator('#draft-seed').fill('PRIVATE-M3-SEED');
  await gm.locator('#generate-draft').click();
  await gm.locator('#draft-recovery').selectOption('tray');
  await gm.locator('#draft-free').check();
  await gm.locator('#draft-board button[aria-label^="Remove"]:enabled').first().click(); await gm.locator('#draft-label').fill('PRIVATE-M3-DISCOVERY');
  await gm.locator('#draft-board button[aria-label^="Remove"]:enabled').first().click(); await gm.locator('#draft-label').fill('PRIVATE-M3-DISCOVERY');
  const downloading = page.waitForEvent('download'); await gm.locator('#export-draft').click();
  let preparation = JSON.parse(await readFile((await (await downloading).path())!, 'utf8')).preparation as PrivatePreparation;
  await gm.locator('#publish-draft').click();
  await expect(player.locator('#board button')).toHaveCount(16);
  // Reload gives the GM a different connection while metadata retains its owner.
  await hostAction('Reconnect GM controller');
  await hostAction('Open puzzle A');
  await expect(gm.locator('#edit-puzzle')).toBeVisible();
  // Real embedded browsers may suppress confirm(). Save must still publish.
  await gm.locator('body').evaluate(() => { window.confirm = () => false; });
  await gm.locator('#edit-puzzle').click();
  await gm.locator('#draft-board button[aria-label^="Remove"]:enabled').first().click();
  const redownload = page.waitForEvent('download');
  await gm.getByText('More options', {exact:true}).click();
  await gm.locator('#export-draft').click();
  preparation = JSON.parse(await readFile((await (await redownload).path())!, 'utf8')).preparation as PrivatePreparation;
  await hostAction('Toggle extra GM connection');
  await gm.getByRole('button', {name:'Save changes',exact:true}).click();
  await expect(player.locator('#piece-tray .unknown-piece')).toHaveCount(3);
  await expect(player.locator('#piece-tray .unknown-piece[title]')).toHaveCount(0);
  await hostAction('Toggle extra GM connection');
  await expect(gm.locator('#play-screen')).toBeVisible();
  await expect(page.locator('#state')).toContainText('g-reconnected');
  await expect(player.locator('#piece-tray .unknown-piece')).toHaveCount(3);
  for (const piece of preparation.withheld) await expect(player.locator('[data-index="'+piece.index+'"]')).toHaveClass(/empty/);
  await gm.locator('#edit-puzzle').click();
  await expect(gm.locator('#draft-summary')).toContainText('3 removed');
  await gm.locator('#return-gm').click();
  await expect(player.locator('#authoring')).toBeEmpty();
  await expect(player.locator('.host-panel')).toBeHidden();
  for (let i=0;i<3;i++) {
    await gm.locator('#piece-tray .unknown-piece').first().click({button:'right'}); await gm.getByRole('menuitem',{name:'Give piece to players',exact:true}).click();
    await expect(player.locator('#inventory option')).toHaveCount(i+1);
  }
  for (const piece of preparation.withheld) {
    await player.locator('[data-index="'+piece.index+'"]').click();
    await player.locator('#place-piece').click();
    await expect(player.locator('[data-index="'+piece.index+'"]').first()).toHaveClass(/occupied/);
    if(piece.index===preparation.withheld[0].index){
      await expect(player.locator('.placed-piece').first()).toHaveAttribute('aria-disabled','false');
      await player.locator('.placed-piece').first().click();
      await expect(player.locator('[data-index="'+piece.index+'"]')).toHaveClass(/empty/);
      await player.locator('[data-index="'+piece.index+'"]',).click();await player.locator('#place-piece').click();
      await expect(player.locator('[data-index="'+piece.index+'"]')).toHaveClass(/occupied/);
    }

  }
  for (let index=0;index<preparation.solution.length;index++) {
    const tile=preparation.solution[index]; if (!tile || tile.terminal) continue;
    if (await player.locator('#success[data-solved="true"]').isVisible()) break;
    const start=preparation.withheld.some(p=>p.index===index)?0:preparation.state.tiles[index]!.rotation;
    const turns=(tile.rotation-start+4)%4;
    if (!turns) continue;
    await player.locator('[data-index="'+index+'"]').click();
    for (let n=0;n<turns;n++) {
      if (await player.locator('#success[data-solved="true"]').isVisible()) break;
      await player.locator('#rotate').click();
      await expect(player.locator('#rotate')).toHaveAttribute('aria-busy','false');
    }
  }
  await expect(player.locator('#success[data-solved="true"]')).toBeVisible();
  await expect(gm.locator('#success[data-solved="true"]')).toBeVisible();
  const publicData=(await page.locator('#state').innerText())+(await page.locator('#messages').innerText());
  for (const secret of [preparation.seed,'PRIVATE-M3-DISCOVERY','solution','discoveryLabel','withheld']) expect(publicData).not.toContain(secret);
  await page.locator('#gm-window').screenshot({path:'docs/evidence/m3-token-gm-host-double.png'});
  await page.locator('#player-window').screenshot({path:'docs/evidence/m3-token-player-host-double.png'});
  // GM actions use the real compiled embedded UI, including suppressed dialogs.
  await gm.locator('#edit-puzzle').click();
  await gm.locator('#draft-board button[aria-label^="Remove"]:enabled').first().click();
  await gm.locator('#draft-board button[aria-label^="Remove"]:enabled').first().click();
  await gm.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(player.locator('.unknown-piece')).toHaveCount(2);
  await gm.locator('#sync-players').click();
  await expect(gm.locator('#feedback')).toContainText('Turn order: Player');
  await gm.locator('.unknown-piece').first().click({button:'right'});
  await gm.getByRole('menuitem',{name:'Give piece to players',exact:true}).click();
  await expect(player.locator('#piece-tray button')).toHaveCount(1);
  await gm.locator('#piece-tray button').click({button:'right'});
  await gm.getByRole('menuitem',{name:'Hide piece',exact:true}).click();
  await expect(player.locator('#piece-tray button')).toHaveCount(0);
  await expect(player.locator('.unknown-piece')).toHaveCount(2);
  await gm.locator('#complete-puzzle').click();
  await expect(player.locator('#success[data-solved="true"]')).toBeVisible();
  await expect(player.locator('.unknown-piece')).toHaveCount(0);
  await expect(player.locator('#piece-tray button')).toHaveCount(0);
  await expect(player.locator('#turn-order-panel #next-turn')).toBeVisible();
  await expect(player.locator('#turn-order-panel #free-play')).toBeDisabled();
  await expect(player.locator('.order-actions')).toHaveCount(0);
  await hostAction('Join second test player');
  await expect(gm.locator('#add-player option[value="second-player"]')).toHaveCount(1);
  await gm.locator('#add-player').selectOption('second-player');await gm.locator('#add-player-button').click();
  await expect(player.locator('#turn-order-list li')).toHaveCount(2);
  await gm.getByRole('button',{name:'Move Second player up',exact:true}).click();
  await expect(player.locator('#turn-order-list li').first()).toContainText('Second player');
  await gm.getByRole('button',{name:'Remove Player',exact:true}).click();
  await expect(player.locator('#turn-order-list li')).toHaveCount(1);
  await gm.locator('#add-player').selectOption('player');await gm.locator('#add-player-button').click();
  await expect(player.locator('#turn-order-list li')).toHaveCount(2);
  await expect(player.locator('#roster-editor')).toBeHidden();
  await gm.locator('body').screenshot({path:'docs/evidence/shared-turn-order-sidebar.png'});
  await gm.locator('#edit-puzzle').click();
  await gm.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(player.locator('#turn-order-list li')).toHaveCount(2);
  await expect(player.locator('#turn-order-list li').first()).toContainText('Second player');
  // M3B uses the same real compiled publication/controller route.
  await gm.locator('#open-setup').click();
  await gm.locator('#setup-kind').selectOption('cube');
  await gm.locator('#draft-free').check();
  await expect(gm.locator('#draft-cube canvas')).toBeVisible();
  await gm.getByRole('button',{name:'Finalize puzzle',exact:true}).click();
  await expect(player.locator('#cube-board canvas')).toBeVisible();
  await expect(player.locator('#board').locator('..')).toBeHidden();
  const cubeRecord=JSON.parse(await page.locator('#state').innerText())[0].metadata['com.arcane-pipes/shared-v1'];
  expect(cubeRecord.puzzle.cubeFaces).toEqual(['front','right']);
  const cubeIndex=cubeRecord.puzzle.tiles.findIndex((tile:{terminal?:string}|null)=>tile&&!tile.terminal);
  await player.locator('#cube-square').selectOption(String(cubeIndex));
  await player.locator('#rotate').click();
  await expect(player.locator('#revision')).toHaveText('Revision 1');
  await expect(gm.locator('#revision')).toHaveText('Revision 1');
  await page.locator('#player-window').evaluate((frame:HTMLIFrameElement)=>{frame.src=frame.src;});
  await expect(player.locator('#cube-board canvas')).toBeVisible();
  await expect(player.locator('#revision')).toHaveText('Revision 1');
  await expect(player.locator('#cube-face-settings')).toHaveCount(0);
  await gm.locator('#complete-puzzle').click();
  await expect(player.locator('#success[data-solved="true"]')).toBeVisible();
  await expect(player.locator('#goal-list')).toContainText('2/2');
  await player.locator('#cube-reset-view').click();
  await page.locator('#player-window').screenshot({path:'docs/evidence/m3b-cube-shared-player.png'});
  // M4 recovery runs through actual GM and player iframe controls.
  await gm.locator('#undo-puzzle').click();
  await expect(player.locator('#success[data-solved="true"]')).toBeHidden();
  await gm.locator('#pause-puzzle').click();
  await expect(player.locator('#active-player')).toHaveText('Paused');
  await expect(player.locator('#rotate')).toBeDisabled();
  await expect(player.locator('.recovery-controls')).toBeHidden();
  await gm.locator('#save-recovery>summary').click();
  const backupDownload=page.waitForEvent('download');await gm.locator('#backup-private').click();
  const backupText=await readFile((await(await backupDownload).path())!,'utf8');
  expect(JSON.parse(backupText).preparation.state.paused).toBe(true);
  await gm.locator('body').evaluate(()=>localStorage.removeItem('arcane-pipes:private:m3:token-room:token-a'));
  await hostAction('Open puzzle A');
  await expect(gm.locator('.demo-banner')).toContainText('private preparation missing');
  await expect(gm.locator('#pause-puzzle')).toBeDisabled();
  await gm.locator('#save-recovery>summary').click();
  await gm.locator('#import-private').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backupText)});
  await expect(gm.locator('#restore-review')).toBeVisible();
  await gm.locator('#restore-save').click();
  await expect(gm.locator('#feedback')).toHaveText('Private backup restored.');
  await expect(player.locator('#active-player')).toHaveText('Paused');
  await gm.locator('#pause-puzzle').click();
  await expect(player.locator('#active-player')).toHaveText('Free play');
  await player.locator('#cube-square').selectOption(String(cubeIndex));await player.locator('#rotate').click();
  await expect(player.locator('#revision')).toHaveText('Revision 6');
  await expect(gm.locator('#revision')).toHaveText('Revision 6');
  const m4Public=(await page.locator('#state').innerText())+(await page.locator('#messages').innerText());
  for(const secret of ['actionHistory','solution','withheld','discoveryLabel'])expect(m4Public).not.toContain(secret);
  if(!(await gm.locator('#backup-private').isVisible()))await gm.locator('#save-recovery>summary').click();
  await page.locator('#gm-window').screenshot({path:'docs/evidence/m4-shared-recovery.png'});
  const sceneState=await page.locator('#state').innerText();
  await hostAction('Toggle test scene');
  await expect(player.locator('#rotate')).toBeDisabled();
  await expect(player.locator('.demo-banner')).toContainText('Open the scene');
  expect(await page.locator('#state').innerText()).toBe(sceneState);
  await hostAction('Toggle test scene');
  await expect(player.locator('#rotate')).toBeEnabled();
  await page.locator('#gm-window').scrollIntoViewIfNeeded();
  const restartDownload=page.waitForEvent('download');await gm.locator('#backup-private').click();
  const restartBackup=await readFile((await(await restartDownload).path())!,'utf8');
  await hostAction('Reconnect GM controller');
  await hostAction('Open puzzle A');
  await gm.locator('#save-recovery>summary').click();
  await gm.locator('#import-private').setInputFiles({name:'restart.json',mimeType:'application/json',buffer:Buffer.from(restartBackup)});await gm.locator('#restore-save').click();
  await expect(gm.locator('#feedback')).toHaveText('Private backup restored.');
  await player.locator('#cube-square').selectOption(String(cubeIndex));await player.locator('#rotate').click();
  await expect(player.locator('#revision')).toHaveText('Revision 7');await expect(gm.locator('#revision')).toHaveText('Revision 7');
  expect(errors).toEqual([]);
});
