import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCommand } from '../src/core/commands.ts';
import { traceEnergy } from '../src/core/connectivity.ts';
import { createFixture } from '../src/core/fixtures.ts';
import { ports } from '../src/core/pieces.ts';
import { projectPublic } from '../src/core/projection.ts';
import { LocalController } from '../src/controller/local-controller.ts';
import { LocalAdapter } from '../src/transport/local-adapter.ts';
import type { Actor, Command, Direction, PuzzleState, Tile } from '../src/core/state.ts';

const lyra: Actor = { id: 'lyra', role: 'PLAYER' };
const gm: Actor = { id: 'demo-host', role: 'GM' };
function rotate(state: PuzzleState, tileIndex: number): Command {
  return { type: 'rotate', tileIndex, expectedRevision: state.revision, puzzleId: state.puzzleId };
}
function advance(state: PuzzleState): Command {
  return { type: 'advance-turn', expectedRevision: state.revision, puzzleId: state.puzzleId };
}
function rejectUnchanged(state: PuzzleState, command: Command, actor: Actor, reason: string) {
  const before = structuredClone(state);
  const result = applyCommand(state, command, actor);
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.reason, reason);
  assert.strictEqual(result.state, state);
  assert.deepEqual(state, before);
}

test('all curated solved boards power both targets; scrambles are unsolved', () => {
  for (const id of ['relay', 'last-connection', 'broken-conduit', 'dual-power'] as const) {
    const preparation = createFixture(id);
    const solved = traceEnergy({ ...preparation.state, tiles: preparation.solution });
    assert.equal(solved.solved, true);
    assert.deepEqual(solved.poweredTargets, [9, 19]);
    assert.equal(traceEnergy(preparation.state).solved, false);
  }
});

test('one-move fixture solves only after B2 rotates clockwise', () => {
  const preparation = createFixture('last-connection');
  assert.deepEqual(traceEnergy(preparation.state).poweredTargets, [19]);
  const result = applyCommand(preparation.state, rotate(preparation.state, 6), lyra);
  assert.equal(result.accepted, true);
  assert.equal(traceEnergy(result.state).solved, true);
  assert.deepEqual(result.state.turnEdit, { tileIndex: 6, originalRotation: 0 });
  assert.equal(result.state.revision, 1);
  assert.equal(preparation.state.tiles[6]!.rotation, 0);
});

test('matching reciprocal openings required; board edges never wrap', () => {
  const flow = (tiles: (Tile | null)[], width: number) => traceEnergy({ width, height: tiles.length / width, tiles });
  assert.equal(flow([{ shape: 'endpoint', rotation: 1, terminal: 'source' }, { shape: 'endpoint', rotation: 0, terminal: 'target' }], 2).solved, false);
  assert.equal(flow([{ shape: 'endpoint', rotation: 1, terminal: 'source' }, { shape: 'endpoint', rotation: 3, terminal: 'target' }], 2).solved, true);
  const wrap = flow([null, { shape: 'endpoint', rotation: 1, terminal: 'source' }, { shape: 'endpoint', rotation: 3, terminal: 'target' }, null], 2);
  assert.deepEqual(wrap.powered, [1]);
  assert.equal(wrap.solved, false);
});

test('loops terminate and all connected nodes are visited once', () => {
  const tiles: Tile[] = [
    { shape: 'elbow', rotation: 1, terminal: 'source' },
    { shape: 'elbow', rotation: 2 },
    { shape: 'elbow', rotation: 0 },
    { shape: 'elbow', rotation: 3, terminal: 'target' },
  ];
  const result = traceEnergy({ width: 2, height: 2, tiles });
  assert.deepEqual(result.powered, [0, 1, 2, 3]);
  assert.deepEqual(result.poweredTargets, [3]);
  assert.equal(result.solved, true);
});

test('empty sockets block flow and a single powered target is insufficient', () => {
  const preparation = createFixture('broken-conduit');
  const energy = traceEnergy(preparation.state);
  assert.equal(preparation.state.tiles[6], null);
  assert.deepEqual(energy.poweredTargets, [19]);
  assert.equal(energy.solved, false);
  assert.equal(energy.powered.includes(6), false);
  assert.equal(energy.powered.includes(7), false);
});

test('no source or no targets never counts as a win', () => {
  assert.equal(traceEnergy({ width: 1, height: 1, tiles: [{ shape: 'endpoint', rotation: 0, terminal: 'source' }] }).solved, false);
  assert.equal(traceEnergy({ width: 1, height: 1, tiles: [{ shape: 'endpoint', rotation: 0, terminal: 'target' }] }).solved, false);
});

test('clockwise port rotation, straight symmetry, and four-turn identity', () => {
  assert.deepEqual(ports({ shape: 'elbow', rotation: 1 }), [1, 2]);
  assert.deepEqual(ports({ shape: 'tee', rotation: 0 }), [0, 1, 3]);
  assert.deepEqual(ports({ shape: 'straight', rotation: 0 }).sort(), ports({ shape: 'straight', rotation: 2 }).sort());
  for (const shape of ['elbow', 'straight', 'tee', 'endpoint'] as const) {
    let state = createFixture('relay').state;
    state = { ...state, tiles: state.tiles.map((tile, index) => index === 0 ? { shape, rotation: 0 as Direction } : tile) };
    const original = structuredClone(state.tiles[0]);
    for (let turn = 0; turn < 4; turn++) {
      const actor: Actor = { id: state.participants[state.activeIndex].id, role: 'PLAYER' };
      const move = applyCommand(state, rotate(state, 0), actor);
      assert.equal(move.accepted, true);
      assert.equal(move.state.turnEdit!.tileIndex, 0);
      state = move.state;
    }
    assert.deepEqual(state.tiles[0], original);
  }
});

test('wrong turn and spectator commands are rejected without mutations', () => {
  const state = createFixture('relay').state;
  rejectUnchanged(state, rotate(state, 6), { id: 'orin', role: 'PLAYER' }, 'wrong-turn');
  rejectUnchanged(state, rotate(state, 6), { id: 'spectator', role: 'PLAYER' }, 'unknown-player');
});

test('unlimited rotations on one piece; GM advancement commits and wraps order', () => {
  let state = createFixture('relay').state;
  state = applyCommand(state, rotate(state, 6), lyra).state;
  state = applyCommand(state, rotate(state, 6), lyra).state;
  assert.equal(state.tiles[6]!.rotation, 1);
  assert.deepEqual(state.turnEdit, { tileIndex: 6, originalRotation: 3 });
  rejectUnchanged(state, advance(state), { id: 'orin', role: 'PLAYER' }, 'wrong-turn');
  rejectUnchanged(state, advance(state), { id: 'spectator', role: 'PLAYER' }, 'unknown-player');
  state = applyCommand(state, advance(state), gm).state;
  assert.equal(state.activeIndex, 1);
  assert.equal(state.turnEdit, null);
  assert.equal(state.tiles[6]!.rotation, 1);
  state = applyCommand(state, advance(state), gm).state;
  assert.equal(state.activeIndex, 0);
  assert.equal(state.revision, 4);
});

test('invalid tiles, empty sockets and fixed source/targets reject unchanged', () => {
  const state = createFixture('relay').state;
  for (const index of [-1, 25, 1.5, NaN, Infinity]) rejectUnchanged(state, rotate(state, index), lyra, 'invalid-tile');
  rejectUnchanged(state, rotate(state, 1), lyra, 'empty-socket');
  for (const index of [10, 9, 19]) rejectUnchanged(state, rotate(state, index), lyra, 'fixed-terminal');
});

test('solved state freezes rotations and turn advancement', () => {
  const preparation = createFixture('relay');
  const state = { ...preparation.state, tiles: preparation.solution };
  rejectUnchanged(state, rotate(state, 6), lyra, 'solved');
  rejectUnchanged(state, advance(state), gm, 'solved');
});

test('wrong instance and stale revisions cannot mutate state', () => {
  const state = createFixture('relay').state;
  rejectUnchanged(state, { ...rotate(state, 6), expectedRevision: -1 }, lyra, 'stale-revision');
  rejectUnchanged(state, { ...rotate(state, 6), puzzleId: 'previous-board' }, lyra, 'wrong-puzzle');
});

test('public projection excludes secrets and unknown nested fields, and is detached', () => {
  const preparation = createFixture('broken-conduit');
  Object.assign(preparation.state, { privateLabel: 'STATE-SECRET' });
  Object.assign(preparation.state.tiles[10]!, { solutionRotation: 'TILE-SECRET' });
  Object.assign(preparation.state.participants[0], { secret: 'PLAYER-SECRET' });
  const publicState = projectPublic(preparation);
  const serialized = JSON.stringify(publicState);
  for (const secret of ['m1-curated-demo-only', 'archivist', 'solution', 'withheld', 'discoveryLabel', 'STATE-SECRET', 'TILE-SECRET', 'PLAYER-SECRET']) {
    assert.equal(serialized.includes(secret), false, `unexpected secret ${secret}`);
  }
  assert.equal(publicState.tiles[6], null);
  publicState.tiles[10]!.rotation = 0;
  publicState.participants[0].name = 'Changed';
  assert.equal(preparation.state.tiles[10]!.rotation, 1);
  assert.equal(preparation.state.participants[0].name, 'Lyra');
});

test('local authority rejects repeated committed moves and resets instance identity', () => {
  const controller = new LocalController();
  const before = controller.snapshot();
  const request = rotate(before, 6);
  assert.equal(controller.submit(request, lyra).accepted, true);
  const after = controller.snapshot();
  assert.equal(controller.submit(request, lyra).accepted, false);
  assert.deepEqual(controller.snapshot(), after);
  controller.load('last-connection');
  assert.notEqual(controller.snapshot().puzzleId, before.puzzleId);
  assert.equal(controller.submit(request, lyra).accepted, false);
});

test('adapter allows only one pending action and captures actor at request time', async () => {
  const adapter = new LocalAdapter();
  const before = adapter.snapshot();
  const request = adapter.request(rotate(before, 6));
  assert.equal(adapter.pending, true);
  adapter.setViewer('orin');
  await assert.rejects(adapter.request(rotate(before, 6)), /already pending/);
  assert.equal((await request).accepted, true);
  assert.equal(adapter.pending, false);
  assert.equal(adapter.snapshot().revision, 1);
});

test('selecting a new piece restores the first orientation; same-piece selection keeps it', () => {
  let state = createFixture('relay').state;
  state = applyCommand(state, rotate(state, 6), lyra).state;
  state = applyCommand(state, rotate(state, 6), lyra).state;
  const select = (tileIndex: number): Command => ({ type: 'select', tileIndex, puzzleId: state.puzzleId, expectedRevision: state.revision });
  const unchanged = applyCommand(state, select(6), lyra);
  assert.strictEqual(unchanged.state, state);
  state = applyCommand(state, select(12), lyra).state;
  assert.equal(state.tiles[6]!.rotation, 3);
  assert.equal(state.turnEdit, null);
  assert.equal(state.tiles[12]!.rotation, 1);
  state = applyCommand(state, rotate(state, 12), lyra).state;
  assert.deepEqual(state.turnEdit, { tileIndex: 12, originalRotation: 1 });
});

test('direct rotation of another piece cannot retain two changes in a turn', () => {
  let state = createFixture('relay').state;
  const original = structuredClone(state);
  state = applyCommand(state, rotate(state, 6), lyra).state;
  state = applyCommand(state, rotate(state, 12), lyra).state;
  assert.deepEqual(state.tiles[6], original.tiles[6]);
  assert.equal(state.tiles[12]!.rotation, 2);
  assert.deepEqual(state.turnEdit, { tileIndex: 12, originalRotation: 1 });
});

test('selecting fixed or empty sockets cancels preview; wrong player cannot cancel', () => {
  for (const tileIndex of [1, 10, 9]) {
    let state = createFixture('relay').state;
    state = applyCommand(state, rotate(state, 6), lyra).state;
    const select: Command = { type: 'select', tileIndex, puzzleId: state.puzzleId, expectedRevision: state.revision };
    rejectUnchanged(state, select, { id: 'orin', role: 'PLAYER' }, 'wrong-turn');
    rejectUnchanged(state, { ...select, tileIndex: -1 }, lyra, 'invalid-tile');
    state = applyCommand(state, select, lyra).state;
    assert.equal(state.turnEdit, null);
    assert.equal(state.tiles[6]!.rotation, 3);
  }
});

test('connected preview stays adjustable until committed; selection can undo a potential win', () => {
  const preparation = createFixture('last-connection');
  let state = applyCommand(preparation.state, rotate(preparation.state, 6), lyra).state;
  assert.equal(projectPublic({ ...preparation, state }).connected, true);
  assert.equal(projectPublic({ ...preparation, state }).solved, false);
  const further = applyCommand(state, rotate(state, 6), lyra);
  assert.equal(further.accepted, true);
  assert.equal(traceEnergy(further.state).solved, false);
  const canceled = applyCommand(state, { type: 'select', tileIndex: 0, puzzleId: state.puzzleId, expectedRevision: state.revision }, lyra);
  assert.equal(traceEnergy(canceled.state).solved, false);
  state = applyCommand(state, advance(state), gm).state;
  assert.equal(projectPublic({ ...preparation, state }).solved, true);
  rejectUnchanged(state, rotate(state, 6), { id: 'orin', role: 'PLAYER' }, 'solved');
});

test('free play keeps all rotations, admits both participants, but excludes spectators', () => {
  let state = createFixture('relay').state;
  const mode: Command = { type: 'set-mode', mode: 'free', puzzleId: state.puzzleId, expectedRevision: state.revision };
  rejectUnchanged(state, mode, lyra, 'gm-only');
  state = applyCommand(state, mode, gm).state;
  state = applyCommand(state, rotate(state, 6), lyra).state;
  state = applyCommand(state, rotate(state, 12), { id: 'orin', role: 'PLAYER' }).state;
  assert.equal(state.tiles[6]!.rotation, 0);
  assert.equal(state.tiles[12]!.rotation, 2);
  assert.equal(state.turnEdit, null);
  rejectUnchanged(state, rotate(state, 6), { id: 'spectator', role: 'PLAYER' }, 'unknown-player');
  rejectUnchanged(state, advance(state), gm, 'free-mode');
});

test('mode switch commits preview; returning to turns uses current board as baseline', () => {
  let state = createFixture('relay').state;
  state = applyCommand(state, rotate(state, 6), lyra).state;
  state = applyCommand(state, { type: 'set-mode', mode: 'free', puzzleId: state.puzzleId, expectedRevision: state.revision }, gm).state;
  assert.equal(state.tiles[6]!.rotation, 0);
  assert.equal(state.turnEdit, null);
  state = applyCommand(state, { type: 'set-mode', mode: 'turns', puzzleId: state.puzzleId, expectedRevision: state.revision }, gm).state;
  state = applyCommand(state, rotate(state, 6), lyra).state;
  state = applyCommand(state, rotate(state, 12), lyra).state;
  assert.equal(state.tiles[6]!.rotation, 0);
});

test('a powered target requires matching source energy', () => {
  const tiles: Tile[] = [
    { shape: 'endpoint', rotation: 1, terminal: 'source', energy: 'azure' },
    { shape: 'straight', rotation: 1 },
    { shape: 'endpoint', rotation: 3, terminal: 'target', energy: 'amber' },
  ];
  const wrong = traceEnergy({ width: 3, height: 1, tiles });
  assert.deepEqual(wrong.poweredBy[2], ['azure']);
  assert.deepEqual(wrong.poweredTargets, []);
  assert.equal(wrong.solved, false);
  tiles[0] = { ...tiles[0], energy: 'amber' };
  assert.equal(traceEnergy({ width: 3, height: 1, tiles }).solved, true);
});

test('two separate energy networks solve; joining their sources invalidates targets', () => {
  const preparation = createFixture('dual-power');
  const tiles = structuredClone(preparation.solution);
  const solved = traceEnergy({ ...preparation.state, tiles });
  assert.deepEqual(solved.poweredBy[9], ['azure']);
  assert.deepEqual(solved.poweredBy[19], ['amber']);
  assert.equal(solved.solved, true);
  tiles[6]!.rotation = 2;
  tiles[16]!.rotation = 0;
  const mixed = traceEnergy({ ...preparation.state, tiles });
  assert.equal(mixed.solved, false);
  assert.equal(mixed.mixed.includes(11), true);
  assert.deepEqual(new Set(mixed.poweredBy[9]), new Set(['azure', 'amber']));
  assert.deepEqual(mixed.poweredTargets, []);
});

test('energy types survive projection without sharing mutable references', () => {
  const preparation = createFixture('dual-power');
  const view = projectPublic(preparation);
  assert.equal(view.tiles[15]!.energy, 'amber');
  assert.deepEqual(view.poweredBy[15], ['amber']);
  view.poweredBy[15].push('azure');
  view.tiles[15]!.energy = 'azure';
  assert.equal(projectPublic(preparation).tiles[15]!.energy, 'amber');
  assert.deepEqual(projectPublic(preparation).poweredBy[15], ['amber']);
});
