import { test, expect } from '@playwright/test';

// Local SDK host double: exercises the compiled SDK/background/action boundary.
// Does not emulate Owlbear service ordering, identity guarantees or persistence.
test('SDK iframe route shares a board, enforces turns and survives action-window closure', async ({ page }) => {
  // Keep all simulated clients visible; offscreen cross-origin frames may
  // throttle the polling/animation work that a real separate client performs.
  await page.setViewportSize({width:1600,height:4200});
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/m2-harness', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Local SDK host double</body></html>' }));
  const extensionOrigin='https://arcane-pipes.test';
  const localBase=test.info().project.use.baseURL!;
  await page.route(extensionOrigin+'/**',async route=>{const url=new URL(route.request().url());const response=await page.request.get(new URL(url.pathname+url.search,localBase).href);await route.fulfill({response});});
  await page.goto('https://www.owlbear.rodeo/m2-harness');
  await page.evaluate((extensionOrigin) => {
    const peers = [
      { id: 'gm', connectionId: 'g', role: 'GM', name: 'GM' },
      { id: 'a', connectionId: 'a1', role: 'PLAYER', name: 'A' },
      { id: 'b', connectionId: 'b1', role: 'PLAYER', name: 'B' },
    ];
    const frames: { frame: HTMLIFrameElement; peer: typeof peers[number]; channel?: string }[] = [];
    let metadata = { unrelated: { keep: true } };
    const emit = (frame: HTMLIFrameElement, id: string, data: unknown) => frame.contentWindow?.postMessage({ id, data }, extensionOrigin);
    window.addEventListener('message', event => {
      const sender = frames.find(f => f.frame.contentWindow === event.source);
      if (!sender || typeof event.data?.id !== 'string') return;
      const { id, data, nonce } = event.data;
      let response: unknown = {};
      if (id === 'OBR_PLAYER_GET_ROLE') response = { role: sender.peer.role };
      else if (id === 'OBR_PLAYER_GET_CONNECTION_ID') response = { connectionId: sender.peer.connectionId };
      else if (id === 'OBR_PLAYER_GET_NAME') response = { name: sender.peer.name };
      else if (id === 'OBR_PARTY_GET_PLAYERS') response = { players: peers.filter(p => p.connectionId !== sender.peer.connectionId) };
      else if (id === 'OBR_ROOM_GET_METADATA') response = { metadata };
      else if (id === 'OBR_ROOM_SET_METADATA') {
        metadata = { ...metadata, ...data.update };
        frames.forEach(f => emit(f.frame, 'OBR_ROOM_METADATA_EVENT_CHANGE', { metadata }));
      } else if (id === 'OBR_BROADCAST_SUBSCRIBE') sender.channel = data.channel;
      else if (id === 'OBR_BROADCAST_SEND_MESSAGE') {
        frames.filter(f => f.channel === data.channel).forEach(f => emit(f.frame, `OBR_BROADCAST_MESSAGE_${data.channel}`, { data: data.data, connectionId: sender.peer.connectionId }));
      }
      if (nonce) emit(sender.frame, `${id}_RESPONSE${nonce}`, response);
    });
    for (const [name, path, peer] of [
      ['background', 'background.html', peers[0]], ['gm', 'index.html', peers[0]],
      ['a', 'index.html', peers[1]], ['b', 'index.html', peers[2]],
    ] as const) {
      const frame = document.createElement('iframe');
      frame.id = name;
      frame.hidden=name==='background';
      frame.width = '1200'; frame.height = '1000';
      frame.src = `${extensionOrigin}/${path}?obrref=${encodeURIComponent(btoa(location.origin + ' test-room'))}`;
      frame.onload = () => emit(frame, 'OBR_READY', { ref: name, userId: peer.id });
      frames.push({ frame, peer });
      document.body.append(frame);
    }
  },extensionOrigin);
  const gm = page.frameLocator('#gm');
  const a = page.frameLocator('#a');
  const b = page.frameLocator('#b');
  await expect(a.locator('#waiting-screen')).toBeVisible();
  await expect(a.locator('#play-screen')).toBeHidden();
  await expect(a.locator('#authoring')).toBeEmpty();
  await gm.locator('#setup-kind').selectOption('relay');
  await gm.getByRole('button', { name: 'Finalize puzzle',exact:true }).click();
  await expect(a.locator('.demo-banner')).toContainText('controller connected');
  await expect(a.locator('#active-player')).toHaveText('A’s turn');
  await expect(b.locator('#active-player')).toHaveText('A’s turn');
  await a.locator('[data-index="6"]').dblclick();
  await expect(a.locator('#revision')).toHaveText('Revision 1');
  await expect(b.locator('#revision')).toHaveText('Revision 1');
  await b.locator('[data-index="7"]').click();
  await expect(b.locator('#rotate')).toBeDisabled();
  await expect(gm.locator('#revision')).toHaveText('Revision 1');
  await expect(a.locator('#rotate')).toHaveAttribute('aria-busy','false');
  await expect(gm.locator('#next-turn')).toBeEnabled();
  await gm.locator('#next-turn').press('Enter');
  await expect(a.locator('#active-player')).toHaveText('B’s turn');
  await page.locator('#gm').evaluate(frame => frame.remove());
  await b.locator('[data-index="7"]').dblclick();
  await expect(a.locator('#revision')).toHaveText('Revision 3');
  await expect(b.locator('#revision')).toHaveText('Revision 3');
  expect(errors).toEqual([]);
});
