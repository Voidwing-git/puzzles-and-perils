import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedController } from '../src/controller/shared-controller.ts';
import type { Peer } from '../src/controller/shared-controller.ts';
import { KEY, parseRequest } from '../src/transport/protocol.ts';
import type { Shared } from '../src/transport/protocol.ts';

async function setup() {
  let peers: Peer[] = [
    { id: 'gm', connectionId: 'g', role: 'GM', name: 'GM' },
    { id: 'a', connectionId: 'a1', role: 'PLAYER', name: 'A' },
    { id: 'b', connectionId: 'b1', role: 'PLAYER', name: 'B' },
  ];
  let metadata: Record<string, unknown> = { unrelated: { keep: true } };
  let fail = false;
  let writes = 0;
  const controller = new SharedController('g', {
    peers: async () => structuredClone(peers),
    read: async () => structuredClone(metadata),
    write: async update => { writes++; if (fail) throw new Error('uncertain'); metadata = { ...metadata, ...structuredClone(update) }; },
  });
  await controller.submit({ id: 'start', generation: 'start', expiresAt: Date.now() + 6000, command: { type: 'advance-turn', expectedRevision: 0, puzzleId: 'start' } }, 'g');
  const shared = () => metadata[KEY] as Shared;
  const request = (id: string, type = 'rotate') => ({ id, generation: shared().generation, expiresAt: Date.now() + 6000, command: {
    type, tileIndex: 6, puzzleId: shared().puzzle.puzzleId, expectedRevision: shared().puzzle.revision,
  } });
  return { controller, shared, request, metadata: () => metadata, writes: () => writes,
    setPeers: (v: Peer[]) => { peers = v; }, peers: () => peers,
    fail: () => { fail = true; }, fill: () => { metadata.other = 'x'.repeat(16000); } };
}
test('shared queue serializes concurrent/stale requests and persists receipts with public state', async () => {
  const t = await setup();
  const first = t.request('one');
  const second = t.request('two');
  await Promise.all([t.controller.submit(first, 'a1'), t.controller.submit(second, 'a1')]);
  assert.equal(t.shared().puzzle.revision, 1);
  assert.equal(t.shared().receipts[1].reason, 'stale-revision');
  const count = t.writes();
  await t.controller.submit(first, 'a1');
  assert.equal(t.writes(), count);
  assert.deepEqual(t.metadata().unrelated, { keep: true });
  for (const secret of ['solution', 'seed', 'withheld', 'discoveryLabel']) assert.ok(!JSON.stringify(t.shared()).includes(secret));
});
test('sender identity, role and turn come from current party, not request claims', async () => {
  const t = await setup();
  await t.controller.submit({ ...t.request('spoof'), role: 'GM', actor: 'a' }, 'b1');
  assert.equal(t.shared().receipts.at(-1)?.reason, 'wrong-turn');
  const gmOnly = t.request('gm-spoof', 'set-mode');
  await t.controller.submit({ ...gmOnly, command: { ...gmOnly.command, mode: 'free' } }, 'a1');
  assert.equal(t.shared().receipts.at(-1)?.reason, 'gm-only');
  const count = t.writes();
  await t.controller.submit(t.request('unknown'), 'unknown');
  assert.equal(t.writes(), count);
  const endTurn = t.request('advance', 'advance-turn');
  await t.controller.submit(endTurn, 'a1');
  assert.equal(t.shared().puzzle.activeIndex, 1);
  const committed = t.writes();
  await t.controller.submit(endTurn, 'a1');
  assert.equal(t.writes(), committed, 'duplicate player end-turn cannot advance twice');
});
test('multiple GM connections, missing owner, and old generations cannot write', async () => {
  const t = await setup();
  const original = t.peers();
  const request = t.request('move');
  t.setPeers([...original, { ...original[0], connectionId: 'g2' }]);
  await t.controller.submit(request, 'a1');
  t.setPeers(original.slice(1));
  await t.controller.submit(request, 'a1');
  t.setPeers(original);
  await t.controller.submit({ ...request, generation: 'old' }, 'a1');
  assert.equal(t.shared().puzzle.revision, 0);
  assert.equal(t.writes(), 1);
});
test('size overflow rejects before write and uncertain writes freeze subsequent requests', async () => {
  const t = await setup();
  t.fill();
  await assert.rejects(t.controller.submit(t.request('full'), 'a1'), /metadata is full/);
  assert.equal(t.writes(), 1);
  const u = await setup();
  u.fail();
  await assert.rejects(u.controller.submit(u.request('uncertain'), 'a1'), /uncertain/);
  assert.equal(u.controller.uncertain, true);
  await u.controller.submit(u.request('later'), 'a1');
  assert.equal(u.writes(), 2);
  assert.equal(u.shared().puzzle.revision, 0);
});
test('wire validation rejects unsupported modes, tile indices, revisions and commands', () => {
  const base = { id: 'x', generation: 'g', expiresAt: Date.now() + 6000, command: { type: 'rotate', tileIndex: 1, expectedRevision: 0, puzzleId: 'p' } };
  assert.ok(parseRequest(base));
  for (const change of [{ type: 'delete' }, { tileIndex: 96 }, { expectedRevision: -1 }, { type: 'set-mode', mode: 'bad' }])
    assert.equal(parseRequest({ ...base, command: { ...base.command, ...change } }), null);
});

test('expired and excessively future requests cannot mutate a still-current revision', async () => {
  const t = await setup();
  await t.controller.submit({ ...t.request('late'), expiresAt: Date.now() - 1 }, 'a1');
  await t.controller.submit({ ...t.request('future'), expiresAt: Date.now() + 60000 }, 'a1');
  assert.equal(t.shared().puzzle.revision, 0);
  assert.equal(t.writes(), 1);
});

test('request expiring during metadata IO cannot commit', async () => {
  const t = await setup();
  const controller = new SharedController('g', {
    peers: async () => t.peers(),
    read: async () => { await new Promise(resolve => setTimeout(resolve, 40)); return t.metadata(); },
    write: async () => { assert.fail('Expired command must not write'); },
  });
  await controller.submit({ ...t.request('queued'), expiresAt: Date.now() + 20 }, 'a1');
  assert.equal(t.shared().puzzle.revision, 0);
});

test('GM or sender changes during metadata IO stop the in-flight commit', async () => {
  for (const change of ['duplicate-gm', 'owner-left', 'sender-left', 'sender-changed'] as const) {
    const t = await setup();
    let checks = 0, writes = 0;
    const initial = t.peers();
    const updated = change === 'duplicate-gm'
      ? [...initial, {...initial[0],connectionId:'g2'}]
      : change === 'owner-left' ? initial.slice(1)
        : change === 'sender-left' ? initial.filter(p=>p.connectionId!=='a1')
          : initial.map(p=>p.connectionId==='a1'?{...p,id:'different-player'}:p);
    const controller = new SharedController('g', {
      peers: async () => structuredClone(++checks === 1 ? initial : updated),
      read: async () => structuredClone(t.metadata()),
      write: async () => { writes++; },
    });
    await controller.submit(t.request('race'), 'a1');
    assert.equal(writes, 0, `${change} must prevent an in-flight write`);
  }
});

test('shared roster editing uses authenticated GM and room players, rejecting invented IDs and player edits', async () => {
  const t=await setup();
  const request=(ids:string[])=>({id:crypto.randomUUID(),generation:t.shared().generation,expiresAt:Date.now()+6000,command:{type:'set-roster',playerIds:ids,puzzleId:t.shared().puzzle.puzzleId,expectedRevision:t.shared().puzzle.revision}});
  await t.controller.submit(request(['b','a']),'a1');assert.equal(t.shared().receipts.at(-1)?.reason,'gm-only');
  await t.controller.submit(request(['b','a']),'g');assert.deepEqual(t.shared().puzzle.participants.map(p=>p.id),['b','a']);
  assert.equal(t.shared().puzzle.activeIndex,1);
  await t.controller.submit(request(['invented']),'g');assert.equal(t.shared().receipts.at(-1)?.reason,'invalid-roster');
  await t.controller.submit(request(['b']),'g');assert.deepEqual(t.shared().puzzle.participants.map(p=>p.id),['b']);
  await t.controller.submit(request(['b','a']),'g');assert.deepEqual(t.shared().puzzle.participants.map(p=>p.id),['b','a']);
});
