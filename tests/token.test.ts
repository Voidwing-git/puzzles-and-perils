import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedController } from '../src/controller/shared-controller.ts';
import { PlayerRehearsal } from '../src/controller/player-rehearsal.ts';
import { createFixture } from '../src/core/fixtures.ts';
import { projectPublic } from '../src/core/projection.ts';
import { KEY, TOKEN_KEY } from '../src/transport/protocol.ts';
import type { Shared, Request } from '../src/transport/protocol.ts';

async function tokens() {
  const data: Record<string, Record<string, unknown>> = {
    a: { [TOKEN_KEY]: true, otherExtension: { keep: 1 } },
    b: { [TOKEN_KEY]: true, otherExtension: { keep: 2 } },
  };
  const peers = [{ id: 'gm', connectionId: 'g', role: 'GM' as const, name: 'GM' },
    { id: 'p', connectionId: 'p1', role: 'PLAYER' as const, name: 'Player' }];
  const make = (id: string) => new SharedController('g', {
    peers: async () => structuredClone(peers), read: async () => structuredClone(data[id]),
    write: async update => { data[id] = { ...data[id], ...structuredClone(update) }; },
  }, id);
  const a = make('a'), b = make('b');
  const get = (id: string) => data[id][KEY] as Shared;
  const request = (id: string, type: Request['command']['type']): Request => ({ id: crypto.randomUUID(), tokenId: id,
    generation: get(id)?.generation ?? 'start', expiresAt: Date.now() + 6000,
    command: { type, tileIndex: 6, puzzleId: get(id)?.puzzle.puzzleId ?? 'start', expectedRevision: get(id)?.puzzle.revision ?? 0 },
  } as Request);
  await a.submit(request('a', 'advance-turn'), 'g');
  await b.submit({ ...request('b', 'advance-turn'), fixture: 'dual-power' }, 'g');
  return { a, b, get, request, data, peers };
}

test('token reset and complete isolate puzzle state, preserve other metadata and fence old requests', async () => {
  const t = await tokens();
  const b = structuredClone(t.get('b'));
  const old = t.request('a', 'rotate');
  await t.a.submit(t.request('a', 'complete-puzzle'), 'g');
  assert.equal(t.get('a').puzzle.solved, true);
  assert.deepEqual(t.get('b'), b);
  await t.a.submit(t.request('a', 'reset-puzzle'), 'g');
  assert.equal(t.get('a').puzzle.solved, false);
  assert.equal(t.get('a').puzzle.revision, 2);
  assert.notEqual(t.get('a').generation, old.generation);
  await t.a.submit({ ...old, command: { ...old.command, expectedRevision: 2 } }, 'p1');
  assert.equal(t.get('a').puzzle.revision, 2);
  assert.deepEqual(t.data.a.otherExtension, { keep: 1 });
  assert.deepEqual(t.get('b'), b);
  await t.b.submit(t.request('b', 'complete-puzzle'), 'g');
  assert.equal(t.get('b').puzzle.solved, true, 'complete uses this token’s two-color fixture');
});

test('players cannot reset, complete or sync a roster; cross-token commands do not write', async () => {
  const t = await tokens();
  for (const type of ['reset-puzzle', 'complete-puzzle', 'sync-players'] as const) {
    await t.a.submit(t.request('a', type), 'p1');
    assert.equal(t.get('a').receipts.at(-1)?.reason, 'gm-only');
    assert.equal(t.get('a').puzzle.revision, 0);
  }
  const before = structuredClone(t.data);
  await t.a.submit(t.request('b', 'complete-puzzle'), 'g');
  assert.deepEqual(t.data, before);
});

test('GM can start alone and explicitly refresh the roster when players join', async () => {
  let metadata: Record<string, unknown> = {};
  const peers: {id: string; connectionId: string; role: 'GM'|'PLAYER'; name: string}[] = [{ id: 'gm', connectionId: 'g', role: 'GM', name: 'GM' }];
  const controller = new SharedController('g', { peers: async () => peers, read: async () => metadata, write: async update => { metadata = { ...metadata, ...update }; } });
  await controller.submit({ id: 'start', expiresAt: Date.now()+6000, generation: 'start', command: {type:'advance-turn',puzzleId:'start',expectedRevision:0} }, 'g');
  let shared = metadata[KEY] as Shared;
  assert.equal(shared.puzzle.participants[0].id, 'gm');
  peers.push({id:'p',connectionId:'p1',role:'PLAYER',name:'Player'});
  await controller.submit({ id:'sync', expiresAt:Date.now()+6000, generation: shared.generation, command: {type:'sync-players',puzzleId:shared.puzzle.puzzleId,expectedRevision:0} }, 'g');
  shared = metadata[KEY] as Shared;
  assert.deepEqual(shared.puzzle.participants, [{id:'p',name:'Player'}]);
});

test('private player rehearsal is detached, enforces turn rules and never changes its source', () => {
  const source = projectPublic(createFixture('relay'));
  const before = structuredClone(source);
  const rehearsal = new PlayerRehearsal(source, 'relay');
  const command = { type: 'rotate' as const, tileIndex: 6, puzzleId: source.puzzleId, expectedRevision: 0 };
  assert.equal(rehearsal.request(command, 'orin', false).accepted, false);
  assert.equal(rehearsal.request(command, 'spectator', false).accepted, false);
  assert.equal(rehearsal.request(command, 'lyra', false).accepted, true);
  assert.equal(rehearsal.snapshot().revision, 1);
  const end = {type:'advance-turn' as const,puzzleId:source.puzzleId,expectedRevision:1};
  assert.equal(rehearsal.request(end,'orin',false).accepted,false);
  assert.equal(rehearsal.request(end,'spectator',false).accepted,false);
  assert.equal(rehearsal.request(end,'lyra',false).accepted,true);
  assert.equal(rehearsal.snapshot().activeIndex,1);
  assert.equal(rehearsal.snapshot().turnEdit,null);
  assert.deepEqual(source, before);
  const detached = rehearsal.snapshot(); detached.tiles[6]!.rotation = 1;
  assert.notDeepEqual(detached, rehearsal.snapshot());
});

import { popupLayout } from '../src/ui/popup-layout.ts';
test('popup sizing keeps a centered clickable surround on different devices', () => {
  for(const [width,height] of [[1600,900],[1600,1100],[768,1024],[390,844],[844,390],[320,568]]) {
    const layout=popupLayout(width,height);
    assert.ok(layout.width<=width-24);assert.ok(layout.height<=height-24);
    assert.deepEqual(layout.anchorPosition,{left:width/2,top:height/2});
    assert.equal(layout.disableClickAway,false);
    assert.deepEqual(layout.transformOrigin,{horizontal:'CENTER',vertical:'CENTER'});
  }
});
