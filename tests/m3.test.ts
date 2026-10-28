import test from 'node:test';
import assert from 'node:assert/strict';
import { ports } from '../src/core/pieces.ts';
import { generate, withhold } from '../src/core/generator.ts';
import { traceEnergy } from '../src/core/connectivity.ts';
import { projectPublic } from '../src/core/projection.ts';
import { applyAdventure } from '../src/core/adventure.ts';
import { LocalController } from '../src/controller/local-controller.ts';
import { assertFits } from '../src/transport/protocol.ts';
import type { Command, PrivatePreparation } from '../src/core/state.ts';
import { SharedController } from '../src/controller/shared-controller.ts';
import { KEY } from '../src/transport/protocol.ts';
import type { Shared, Request } from '../src/transport/protocol.ts';
import { readPrivate, savePrivate } from '../src/core/private-store.ts';

for (const size of [4, 5, 6]) for (const powers of [1, 2, 3]) for (const targets of [1, 2]) {
  test(`generated ${size}x${size}, ${powers} currents, ${targets} targets each: deterministic, valid solution, unsolved, payload bound`, () => {
    for (let seed = 0; seed < 40; seed++) {
      const settings = { size, powers, targets, seed: `qualification-${seed}` };
      const p = generate(settings, 'p');
      assert.deepEqual(p, generate(settings, 'p'));
      assert.equal(traceEnergy({ ...p.state, tiles: p.solution }).solved, true);
      assert.equal(traceEnergy(p.state).solved, false);
      assert.equal(p.solution.filter(t => t?.terminal === 'source').length, powers);
      assert.equal(p.solution.filter(t => t?.terminal === 'target').length, powers * targets);
      const goals = p.solution.flatMap((tile,index)=>tile?.terminal==='target'?[index]:[]);
      for (const index of goals) {
        const goal = p.solution[index]!;
        assert.equal(goal.shape,'endpoint');assert.equal(ports(goal).length,1);
        const direction=ports(goal)[0];
        const neighbor=index+[ -size,1,size,-1 ][direction];
        assert.ok(p.solution[neighbor] && !p.solution[neighbor]!.terminal,'each goal connects through an ordinary pipe, never another terminal');
        const without = [...p.solution];without[index]=null;
        const stillPowered=traceEnergy({...p.state,tiles:without}).poweredTargets;
        for(const other of goals.filter(other=>other!==index)) assert.ok(stillPowered.includes(other),'no goal is a pass-through for another goal');
        for(const other of goals.filter(other=>other!==index && p.solution[other]!.energy===goal.energy)) {
          const distance=Math.abs(index%size-other%size)+Math.abs(Math.floor(index/size)-Math.floor(other/size));
          assert.ok(distance>1,'same-current goals must not be adjacent');
        }
      }
      const shared = { version: 1 as const, owner: 'owner-connection-123', generation: 'generation-123', puzzle: projectPublic(p),
        receipts: Array.from({ length: 24 }, (_, i) => ({ id: `request-id-${i}-1234567890`, connection: 'player-connection-id', revision: i, accepted: true })) };
      assertFits({}, shared);
    }
  });
}
const gm = { id: 'gm', role: 'GM' as const }, player = { id: 'lyra', role: 'PLAYER' as const };
test('same settings produce many distinct solved routes, beyond rotations of one serpentine grid', () => {
  for (const size of [4, 5, 6]) {
    const layouts = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(generate({ size, powers: 1, targets: 2, seed: `variety-${i}` }, 'p').solution)));
    assert.ok(layouts.size >= 30, `${size}x${size} needs route variety; got ${layouts.size}`);
  }
});
function prepared(mode: 'socket' | 'tray') {
  let p = generate({ size: 5, powers: 2, targets: 2, seed: 'adventure' }, 'adventure');
  const ordinary = p.state.tiles.flatMap((t, i) => t && !t.terminal ? [i] : []);
  p = withhold(withhold(p, ordinary[0], 'SECRET discovery one'), ordinary[1], 'SECRET discovery two');
  p.recoveryMode = mode;
  p.startingState = structuredClone(p.state); p.startingWithheld = structuredClone(p.withheld);
  return p;
}
function command(p: PrivatePreparation, action: object): Command {
  return { puzzleId: p.state.puzzleId, expectedRevision: p.state.revision, ...action } as Command;
}

test('socket recovery preserves rotations, rejects stale/duplicate/player recovery and never reveals remaining secrets', () => {
  let p = prepared('socket');
  const oldId = p.withheld[0].id;
  const rotate = p.state.tiles.findIndex(t => t && !t.terminal);
  p.state.mode = 'free';
  p = applyAdventure(p, command(p, { type: 'rotate', tileIndex: rotate }), player).preparation;
  const rotation = p.state.tiles[rotate]!.rotation;
  const recover = command(p, { type: 'recover', pieceId: oldId });
  assert.equal(applyAdventure(p, recover, player).result.accepted, false);
  const old = p;
  p = applyAdventure(p, recover, gm).preparation;
  assert.notEqual(p, old); assert.equal(p.state.tiles[rotate]!.rotation, rotation);
  assert.equal(applyAdventure(p, recover, gm).result.accepted, false);
  assert.equal(applyAdventure(p, command(p, { type: 'recover', pieceId: oldId }), gm).result.accepted, false);
  const json = JSON.stringify(projectPublic(p));
  for (const secret of ['SECRET', 'discoveryLabel', 'withheld', 'solution', 'seed', 'startingState']) assert.ok(!json.includes(secret));
  assert.equal(traceEnergy({ ...p.state, tiles: p.solution }).solved, true);
});

test('tray placement and rotation share one provisional piece; switching restores socket and inventory; commitment keeps placement', () => {
  let p = prepared('tray'); const socket = p.withheld[0].index;
  p = applyAdventure(p, command(p, { type: 'recover', pieceId: p.withheld[0].id }), gm).preparation;
  const piece = p.state.inventory![0]; assert.equal(piece.tile.rotation, 0);
  assert.equal(p.state.tiles[socket], null);
  p = applyAdventure(p, command(p, { type: 'place', tileIndex: socket, pieceId: piece.id }), player).preparation;
  assert.equal(p.state.inventory!.length, 0);
  p = applyAdventure(p, command(p, { type: 'rotate', tileIndex: socket }), player).preparation;
  const other = p.state.tiles.findIndex((t, i) => i !== socket && t && !t.terminal);
  p = applyAdventure(p, command(p, { type: 'rotate', tileIndex: other }), player).preparation;
  assert.equal(p.state.tiles[socket], null); assert.equal(p.state.inventory![0].tile.rotation, 0);
  p = applyAdventure(p, command(p, { type: 'place', tileIndex: socket, pieceId: piece.id }), player).preparation;
  p = applyAdventure(p, command(p, { type: 'advance-turn' }), player).preparation;
  assert.ok(p.state.tiles[socket]); assert.equal(p.state.turnEdit, null); assert.equal(p.state.inventory!.length, 0);
  p = applyAdventure(p, command(p, { type: 'recall-piece', tileIndex: socket }), gm).preparation;
  assert.equal(p.state.tiles[socket], null); assert.equal(p.state.inventory!.length, 1);
  assert.equal(applyAdventure(p, command(p, { type: 'place', tileIndex: socket, pieceId: p.state.inventory![0].id }), player).result.accepted, false);
});

test('reset keeps discoveries and restores recovered tray pieces; failed private persistence preserves active state', () => {
  let p = prepared('tray'); const socket = p.withheld[0].index;
  p = applyAdventure(p, command(p, { type: 'recover', pieceId: p.withheld[0].id }), gm).preparation;
  p = applyAdventure(p, command(p, { type: 'place', tileIndex: socket, pieceId: p.state.inventory![0].id }), player).preparation;
  p = applyAdventure(p, command(p, { type: 'advance-turn' }), gm).preparation;
  p = applyAdventure(p, command(p, { type: 'reset-puzzle' }), gm).preparation;
  assert.equal(p.state.inventory!.length, 1); assert.equal(p.withheld.length, 1); assert.equal(p.state.tiles[socket], null);
  const controller = new LocalController(() => { throw new Error('save failed'); });
  const before = controller.snapshot();
  assert.throws(() => controller.publish(p), /save failed/); assert.deepEqual(controller.snapshot(), before);
  assert.throws(() => controller.submit({ type: 'rotate', tileIndex: 6, puzzleId: before.puzzleId, expectedRevision: before.revision }, player), /save failed/);
  assert.deepEqual(controller.snapshot(), before);
});

test('invalid configuration and terminals cannot be silently reduced or withheld', () => {
  for (const settings of [{ size: 7, powers: 1, targets: 2, seed: 'x' }, { size: 4, powers: 4, targets: 2, seed: 'x' }, { size: 4, powers: 3, targets: 3, seed: 'x' }]) assert.throws(() => generate(settings, 'x'));
  const p = generate({ size: 4, powers: 3, targets: 2, seed: 'x' }, 'p');
  assert.throws(() => withhold(p, p.state.tiles.findIndex(t => t?.terminal), 'secret'));
});

test('shared private staging precedes metadata; recovery is atomic on save/size failures and private data stays local', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>(); const events: string[] = [];
  let failSave = false;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (failSave) throw new Error('quota'); values.set(key, value); events.push('save'); },
  } });
  try {
    const p = prepared('tray'); const draftId = crypto.randomUUID(); p.state.puzzleId = draftId;
    savePrivate(`qualification:draft:${draftId}`, p);
    let metadata: Record<string, unknown> = { other: 'preserved' };
    const controller = new SharedController('g', {
      peers: async () => [{ id: 'gm', name: 'GM', role: 'GM', connectionId: 'g' }, { id: 'lyra', name: 'Lyra', role: 'PLAYER', connectionId: 'p' }],
      read: async () => structuredClone(metadata),
      write: async update => { events.push('write'); metadata = { ...metadata, ...structuredClone(update) }; },
    }, undefined, 'qualification');
    const publish: Request = { id: 'publish', generation: 'start', expiresAt: Date.now() + 6000,
      command: { type: 'publish-draft', draftId, puzzleId: 'start', expectedRevision: 0 } };
    events.length = 0; await controller.submit(publish, 'g');
    assert.deepEqual(events, ['save', 'write', 'save']);
    let shared = metadata[KEY] as Shared;
    const request: Request = { id: 'recover', generation: shared.generation, expiresAt: Date.now() + 6000,
      command: { type: 'recover', pieceId: p.withheld[0].id!, expectedRevision: 0, puzzleId: draftId } };
    const before = structuredClone(metadata);
    failSave = true; await assert.rejects(controller.submit(request, 'g'), /Private save unavailable/);
    assert.deepEqual(metadata, before); assert.equal(controller.uncertain, false);
    failSave = false; metadata.other = 'x'.repeat(16000);
    await assert.rejects(controller.submit(request, 'g'), /metadata is full/);
    assert.equal(readPrivate('qualification:room')!.withheld.length, 2);
    metadata.other = 'preserved'; await controller.submit(request, 'g');
    shared = metadata[KEY] as Shared;
    assert.equal(shared.puzzle.inventory!.length, 1); assert.equal(readPrivate('qualification:room')!.withheld.length, 1);
    const after = structuredClone(metadata); await controller.submit(request, 'g'); assert.deepEqual(metadata, after);
    for (const secret of ['SECRET', 'seed', 'solution', 'discoveryLabel', 'withheld']) assert.ok(!JSON.stringify(shared).includes(secret));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('any current GM can save over another GM puzzle; players and stale moves cannot publish', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {configurable:true,value:{
    getItem:(key:string)=>values.get(key)??null,
    setItem:(key:string,value:string)=>values.set(key,value),
  }});
  try {
    const draft = prepared('tray');
    const draftId = crypto.randomUUID(); draft.state.puzzleId = draftId;
    savePrivate(`reconnect:draft:${draftId}`,draft);
    const initial = projectPublic(prepared('tray'));
    let shared: Shared = {version:1,owner:'old-gm',generation:'old-generation',puzzle:initial,receipts:[]};
    const sole: import('../src/controller/shared-controller.ts').Peer[] = [{id:'gm',name:'GM',role:'GM',connectionId:'new-gm'}];
    let peers = sole; let writes = 0;
    const controller = new SharedController('new-gm',{
      peers:async()=>structuredClone(peers),
      read:async()=>({[KEY]:structuredClone(shared),unrelated:'kept'}),
      write:async update=>{writes++;shared=structuredClone(update[KEY]) as Shared;},
    },undefined,'reconnect');
    const request: Request = {id:'explicit-save',generation:shared.generation,expiresAt:Date.now()+6000,
      command:{type:'publish-draft',draftId,puzzleId:initial.puzzleId,expectedRevision:initial.revision}};
    await controller.submit({...request,command:{type:'rotate',tileIndex:0,puzzleId:initial.puzzleId,expectedRevision:initial.revision}},'new-gm');
    assert.equal(writes,0,'ordinary actions cannot adopt an orphan');
    peers=[...sole,{...sole[0],connectionId:'old-gm'},{id:'p',name:'Player',role:'PLAYER',connectionId:'player'}];
    await controller.submit(request,'player');assert.equal(writes,0,'players cannot publish');
    await controller.submit(request,'new-gm');
    assert.equal(writes,1);assert.equal(shared.owner,'new-gm');assert.equal(shared.puzzle.puzzleId,draftId);
    assert.equal(shared.puzzle.missingCount,2);assert.notEqual(shared.generation,'old-generation');
    await controller.submit(request,'new-gm');assert.equal(writes,1,'old generation is fenced');
  } finally {
    if(previous)Object.defineProperty(globalThis,'localStorage',previous);
    else Reflect.deleteProperty(globalThis,'localStorage');
  }
});

test('per-piece GM restore and give actions keep different destinations on reset', () => {
  const p = prepared('socket');
  const controller = new LocalController(); controller.publish(p);
  for (const [i, destination] of ['socket', 'tray'].entries()) {
    const before = controller.snapshot();
    const result = controller.submit({type:'recover',pieceId:p.withheld[i].id!,destination:destination as 'socket'|'tray',
      puzzleId:before.puzzleId,expectedRevision:before.revision},{id:'gm',role:'GM'});
    assert.equal(result.accepted,true);
  }
  const beforeReset=controller.snapshot();
  assert.ok(beforeReset.tiles[p.withheld[0].index]); assert.equal(beforeReset.tiles[p.withheld[1].index],null);
  assert.equal(beforeReset.inventory?.length,1);
  controller.submit({type:'reset-puzzle',puzzleId:beforeReset.puzzleId,expectedRevision:beforeReset.revision},{id:'gm',role:'GM'});
  const after=controller.snapshot(); assert.ok(after.tiles[p.withheld[0].index]);
  assert.equal(after.tiles[p.withheld[1].index],null);assert.equal(after.inventory?.length,1);
  assert.equal(after.missingCount,0);
});

test('GM can hide, reset, reveal again, and solve with pieces still missing', () => {
  const p=prepared('tray');const c=new LocalController();c.publish(p);
  const run=(command: Record<string,unknown>,role:'GM'|'PLAYER'='GM')=>{const s=c.snapshot();return c.submit({...command,puzzleId:s.puzzleId,expectedRevision:s.revision} as Command,{id:'gm',role});};
  assert.equal(run({type:'recover',pieceId:p.withheld[0].id}).accepted,true);
  const id=c.snapshot().inventory![0].id;
  assert.equal(run({type:'hide-piece',pieceId:id},'PLAYER').accepted,false);
  assert.equal(run({type:'hide-piece',pieceId:id}).accepted,true);
  assert.equal(c.snapshot().inventory!.length,0);assert.equal(c.snapshot().missingCount,2);
  assert.equal(run({type:'reset-puzzle'}).accepted,true);
  assert.equal(c.snapshot().inventory!.length,0);assert.equal(c.snapshot().missingCount,2);
  assert.equal(run({type:'recover',pieceId:id,destination:'tray'}).accepted,true);
  assert.equal(c.snapshot().inventory![0].id,id);
  assert.equal(run({type:'complete-puzzle'}).accepted,true);
  assert.equal(c.snapshot().solved,true);assert.equal(c.snapshot().missingCount,0);
  assert.equal(c.snapshot().inventory!.length,0);
  assert.equal(run({type:'reset-puzzle'}).accepted,true);
  for(const piece of p.withheld)assert.ok(c.snapshot().tiles[piece.index]);
  const serialized=JSON.stringify(c.snapshot());
  for(const secret of ['trayOrigins','hiddenInventory','discoveryLabel','SECRET'])assert.ok(!serialized.includes(secret));
});

test('a tray piece from an earlier build can be hidden and revealed without inventing an original socket', () => {
  const p=prepared('tray');p.state.inventory=[{id:'recovered-77',tile:{shape:'elbow',rotation:2}}];
  const c=new LocalController();c.publish(p);
  const run=(type:'hide-piece'|'recover',destination?:'socket'|'tray')=>{const s=c.snapshot();return c.submit({type,pieceId:'recovered-77',destination,puzzleId:s.puzzleId,expectedRevision:s.revision} as Command,{id:'gm',role:'GM'});};
  assert.equal(run('hide-piece').accepted,true);assert.equal(c.snapshot().missingCount,3);
  assert.equal(run('recover','socket').accepted,false);
  assert.equal(run('recover','tray').accepted,true);
  assert.deepEqual(c.snapshot().inventory,[{id:'recovered-77',tile:{shape:'elbow',rotation:2}}]);
});

test('recovered pieces recall provisionally and after commitment without losing or duplicating identity', () => {
  const p=prepared('tray');const c=new LocalController();c.publish(p);
  const run=(command:Record<string,unknown>,actor: import('../src/core/state.ts').Actor=gm)=>{const s=c.snapshot();return c.submit({...command,puzzleId:s.puzzleId,expectedRevision:s.revision} as Command,actor);};
  run({type:'recover',pieceId:p.withheld[0].id});const id=c.snapshot().inventory![0].id;const socket=p.withheld[0].index;
  run({type:'place',pieceId:id,tileIndex:socket},player);
  assert.equal(c.snapshot().placements?.[0].id,id);
  assert.equal(run({type:'return-piece',pieceId:id},{id:'orin',role:'PLAYER'}).accepted,false);
  assert.equal(run({type:'return-piece',pieceId:id},player).accepted,true);
  assert.equal(c.snapshot().tiles[socket],null);assert.equal(c.snapshot().inventory!.filter(p=>p.id===id).length,1);assert.equal(c.snapshot().placements?.length,0);
  run({type:'place',pieceId:id,tileIndex:socket},player);run({type:'advance-turn'});
  assert.equal(run({type:'return-piece',pieceId:id},player).accepted,false);
  assert.equal(run({type:'return-piece',pieceId:id}).accepted,true);
  assert.equal(c.snapshot().inventory!.filter(p=>p.id===id).length,1);
  assert.equal(c.snapshot().tiles[socket],null);
  const revision=c.snapshot().revision;
  assert.equal(run({type:'return-piece',pieceId:id}).accepted,false);assert.equal(c.snapshot().revision,revision);
});

test('GM can reorder, remove and add room players while preserving or safely handing off the active turn', () => {
  const c=new LocalController();const before=c.snapshot();
  const submit=(ids:string[],role:'GM'|'PLAYER'='GM')=>{const s=c.snapshot();return c.submit({type:'set-roster',playerIds:ids,puzzleId:s.puzzleId,expectedRevision:s.revision},{id:role==='GM'?'gm':'lyra',role});};
  assert.equal(submit(['orin','lyra'],'PLAYER').accepted,false);
  assert.equal(submit(['orin','orin']).accepted,false);assert.equal(submit(['invented']).accepted,false);
  assert.equal(submit(['orin','lyra']).accepted,true);
  assert.deepEqual(c.snapshot().participants.map(p=>p.id),['orin','lyra']);
  assert.equal(c.snapshot().participants[c.snapshot().activeIndex].id,'lyra');
  const s=c.snapshot();c.submit({type:'rotate',tileIndex:6,puzzleId:s.puzzleId,expectedRevision:s.revision},{id:'lyra',role:'PLAYER'});
  assert.equal(submit(['orin']).accepted,true);
  assert.equal(c.snapshot().tiles[6]!.rotation,before.tiles[6]!.rotation,'roster edits roll back unfinished turn previews');
  assert.equal(c.snapshot().participants[0].id,'orin');
  assert.equal(submit(['orin','lyra']).accepted,true);
  assert.equal(submit([]).accepted,true);assert.equal(c.snapshot().participants[0].id,'gm');
  assert.equal(c.snapshot().rosterCustomized,true);
});
