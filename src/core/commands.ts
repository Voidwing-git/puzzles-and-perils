import { traceEnergy } from './connectivity.ts';
import { applyAdmin } from './admin.ts';
import type { Actor, Command, Direction, PuzzleState } from './state.ts';

export type Rejection = 'wrong-puzzle' | 'stale-revision' | 'unknown-player' | 'wrong-turn' |
  'invalid-tile' | 'empty-socket' | 'fixed-terminal' | 'solved' | 'gm-only' | 'free-mode' | 'invalid-roster' | 'paused' | 'no-history';
export type CommandResult = { accepted: true; state: PuzzleState } |
  { accepted: false; state: PuzzleState; reason: Rejection };

export function applyCommand(state: PuzzleState, command: Command, actor: Actor): CommandResult {
  const admin = applyAdmin(state, command, actor, 'relay');
  if (admin) return admin;
  const reject = (reason: Rejection): CommandResult => ({ accepted: false, state, reason });
  if (command.puzzleId !== state.puzzleId) return reject('wrong-puzzle');
  if (command.expectedRevision !== state.revision) return reject('stale-revision');
  if(state.paused)return reject('paused');
  if (command.type === 'set-mode') {
    if (actor.role !== 'GM') return reject('gm-only');
    // Changing mode commits the current preview, preserving its orientation.
    return { accepted: true, state: { ...state, mode: command.mode, turnEdit: null, revision: state.revision + 1 } };
  }
  if (command.type === 'advance-turn') {
    if (actor.role !== 'GM') {
      if (!state.participants.some(player => player.id === actor.id)) return reject('unknown-player');
      if (state.participants[state.activeIndex].id !== actor.id) return reject('wrong-turn');
    }
    if (state.mode === 'free') return reject('free-mode');
    if (traceEnergy(state).solved && state.turnEdit === null) return reject('solved');
    return { accepted: true, state: { ...state, activeIndex: (state.activeIndex + 1) % state.participants.length,
      turnEdit: null, revision: state.revision + 1 } };
  }
  if (command.type === 'return-piece') {
    if (actor.role !== 'GM') {
      if (!state.participants.some(p=>p.id===actor.id)) return reject('unknown-player');
      if (state.mode === 'turns' && state.participants[state.activeIndex].id !== actor.id) return reject('wrong-turn');
    }
    const restored = rollbackPreview(state);
    // A provisional placement is already back in inventory after rollback.
    if (state.turnEdit?.placedPiece === command.pieceId && restored.inventory?.some(p=>p.id===command.pieceId))
      return {accepted:true,state:{...restored,turnEdit:null,revision:state.revision+1}};
    const placed = restored.placements?.find(p=>p.id===command.pieceId);
    const tile = placed && restored.tiles[placed.tileIndex];
    if (!placed || !tile || tile.terminal || restored.inventory?.some(p=>p.id===command.pieceId)) return reject('invalid-tile');
    const tiles = [...restored.tiles]; tiles[placed.tileIndex]=null;
    return {accepted:true,state:{...restored,tiles,turnEdit:null,
      inventory:[...(restored.inventory??[]),{id:command.pieceId,tile:{...tile}}],
      placements:restored.placements!.filter(p=>p.id!==command.pieceId),revision:state.revision+1}};
  }
  if (command.type !== 'rotate' && command.type !== 'select' && command.type !== 'place') return reject('gm-only');
  if (!state.participants.some((player) => player.id === actor.id)) return reject('unknown-player');
  if (state.mode === 'turns' && state.participants[state.activeIndex].id !== actor.id) return reject('wrong-turn');
  if (traceEnergy(state).solved && state.turnEdit === null) return reject('solved');
  if (!Number.isInteger(command.tileIndex) || command.tileIndex < 0 || command.tileIndex >= state.tiles.length) return reject('invalid-tile');
  if (command.type === 'place') {
    const restored = rollbackPreview(state);
    const piece = restored.inventory?.find(p => p.id === command.pieceId);
    if (!piece || restored.tiles[command.tileIndex]) return reject('invalid-tile');
    const tiles = [...restored.tiles];
    tiles[command.tileIndex] = { ...piece.tile };
    return { accepted: true, state: { ...restored, tiles, placements:[...(restored.placements??[]).filter(p=>p.id!==piece.id),{id:piece.id,tileIndex:command.tileIndex}], inventory: restored.inventory!.filter(p => p.id !== piece.id),
      turnEdit: state.mode === 'turns' ? { tileIndex: command.tileIndex, originalRotation: piece.tile.rotation, placedPiece: piece.id } : null,
      revision: state.revision + 1 } };
  }
  if (command.type === 'select') {
    if (!state.turnEdit || state.turnEdit.tileIndex === command.tileIndex) return { accepted: true, state };
    return { accepted: true, state: { ...rollbackPreview(state), turnEdit: null, revision: state.revision + 1 } };
  }
  const tile = state.tiles[command.tileIndex];
  if (!tile) return reject('empty-socket');
  if (tile.terminal) return reject('fixed-terminal');
  const switching = state.turnEdit !== null && state.turnEdit.tileIndex !== command.tileIndex;
  const base = switching ? rollbackPreview(state) : state;
  const tiles = [...base.tiles];
  tiles[command.tileIndex] = { ...tile, rotation: ((tile.rotation + 1) % 4) as Direction };
  const turnEdit = state.mode === 'turns'
    ? (!switching && state.turnEdit ? state.turnEdit : { tileIndex: command.tileIndex, originalRotation: tile.rotation })
    : null;
  return { accepted: true, state: { ...base, tiles, turnEdit,
    revision: state.revision + 1 } };
}

export function rollbackPreview(state: PuzzleState): PuzzleState {
  const tiles = [...state.tiles];
  let inventory = state.inventory;
  let placements = state.placements;
  if (state.turnEdit) {
    const { tileIndex, originalRotation } = state.turnEdit;
    if (state.turnEdit.placedPiece) {
      inventory = [...(inventory ?? []), { id: state.turnEdit.placedPiece, tile: { ...tiles[tileIndex]!, rotation: originalRotation } }];
      tiles[tileIndex] = null;
      placements = placements?.filter(p=>p.id!==state.turnEdit!.placedPiece);
    } else tiles[tileIndex] = { ...tiles[tileIndex]!, rotation: originalRotation };
  }
  return { ...state, tiles, ...(inventory ? { inventory } : {}), ...(placements ? {placements} : {}) };
}

export const rejectionMessages: Record<Rejection, string> = {
  paused:'The GM has paused this puzzle.',
  'no-history':'No earlier action is available to undo.',
  'wrong-puzzle': 'This request belongs to a different puzzle.',
  'stale-revision': 'The board changed. Select your move again.',
  'unknown-player': 'Spectators can inspect the board, but cannot rotate pieces.',
  'wrong-turn': 'Wait for your turn to rotate a piece.',
  'invalid-tile': 'That tile does not exist.',
  'empty-socket': 'This socket is empty. Recover a piece before placing it.',
  'fixed-terminal': 'Source and target runes are fixed in place.',
  solved: 'The runes are awakened. Load a prepared board to play again.',
  'gm-only': 'Only the GM can use this control.',
  'free-mode': 'Free play is enabled. There are no turns to advance.',
  'invalid-roster': 'Choose unique players from this puzzle or the connected room.',
};
