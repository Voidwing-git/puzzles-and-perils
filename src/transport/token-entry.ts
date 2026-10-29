import OBR from '@owlbear-rodeo/sdk';
import { KEY, TOKEN_KEY } from './protocol.ts';
import type { Item } from '@owlbear-rodeo/sdk';
import { popupLayout } from '../ui/popup-layout.ts';

const ENTRY = 'com.arcane-pipes/token';
export async function registerTokenEntry() {
  const base = new URL(import.meta.env.BASE_URL, location.origin);
  const icon = new URL('icon.svg', base).href;
  const open = async (item: Item) => {
    const gm = await OBR.player.getRole() === 'GM';
    if (!gm && (!item.metadata[KEY] || item.metadata[TOKEN_KEY] !== true)) throw new Error('The GM has not finalized this puzzle yet.');
    const url = new URL('index.html', base);
    url.searchParams.set('token', item.id);
    url.searchParams.set('view', gm ? item.metadata[KEY] ? 'gm' : 'setup' : 'player');
    const [viewportWidth, viewportHeight] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
    await OBR.popover.open({ id: ENTRY + '/window', url: url.href,
      ...popupLayout(viewportWidth, viewportHeight),
    });
  };
  const report = (error: unknown) => { void OBR.notification.show(error instanceof Error ? error.message : 'Puzzle could not open.', 'ERROR'); };
  await OBR.contextMenu.create({
    id: ENTRY + '/attach',
    icons: [{ icon, label: 'Make puzzle', filter: { roles: ['GM'], min: 1, max: 1, every: [{ key: ['metadata', TOKEN_KEY], value: true, operator: '!=' }] } }],
    onClick(context) {
      void (async () => {
        if (await OBR.player.getRole() !== 'GM' || context.items.length !== 1) return;
        const id = context.items[0].id;
        const item = (await OBR.scene.items.getItems([id]))[0];
        if (item) await open(item);
      })().catch(report);
    },
  });
  await OBR.contextMenu.create({
    id: ENTRY + '/open',
    icons: [
      { icon, label: 'Open GM view', filter: { roles: ['GM'], min: 1, max: 1, every: [{ key: ['metadata', TOKEN_KEY], value: true }] } },
      { icon, label: 'Open puzzle', filter: { roles: ['PLAYER'], min: 1, max: 1, every: [{ key: ['metadata', TOKEN_KEY], value: true }] } },
    ],
    onClick(context) { if (context.items.length === 1) void open(context.items[0]).catch(report); },
  });
  // Native Move-tool double-click is reserved by Owlbear. This optional tool
  // provides explicit double-click entry without overriding normal selection.
  await OBR.tool.create({ id: ENTRY + '/tool', icons: [{ icon, label: 'Puzzle interaction' }], defaultMode: ENTRY + '/mode' });
  await OBR.tool.createMode({
    id: ENTRY + '/mode', icons: [{ icon, label: 'Double-click a puzzle token' }],
    onToolDoubleClick(_context, event) {
      if (event.target?.metadata[TOKEN_KEY] === true) void open(event.target).catch(report);
      else return true;
    },
  });
}

export async function tokenMetadata(tokenId: string, requireFinalized = true) {
  if (!await OBR.scene.isReady()) throw new Error('Open the scene containing this puzzle token.');
  const token = (await OBR.scene.items.getItems([tokenId]))[0];
  if (!token || (requireFinalized && token.metadata[TOKEN_KEY] !== true)) throw new Error('This token has no finalized puzzle, or is no longer in this scene.');
  return token.metadata;
}

export async function writeTokenMetadata(tokenId: string, update: Record<string, unknown>) {
  if (!await OBR.scene.isReady()) throw new Error('Open the scene containing this puzzle token.');
  await OBR.scene.items.updateItems([tokenId], items => {
    if (items.length !== 1) throw new Error('Puzzle token is unavailable.');
    // Only our namespaced value changes; never spread a request into metadata.
    items[0].metadata[KEY] = update[KEY];
    items[0].metadata[TOKEN_KEY] = true;
  });
}
