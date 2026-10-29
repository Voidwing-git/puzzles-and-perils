import { traceEnergy } from './connectivity.ts';
import {projectChallenge} from './challenges.ts';
import { cloneTile } from './state.ts';
import type { PrivatePreparation, PublicPuzzle } from './state.ts';

// An allowlist, never a spread or serialized copy of private preparation.
export function projectPublic(preparation: PrivatePreparation): PublicPuzzle {
  const state = preparation.state;
  const energy = traceEnergy(state);
  return {
    schemaVersion: 2,
    ...(state.puzzleType==='challenge'&&state.challenge?{puzzleType:'challenge' as const,challenge:projectChallenge(state.challenge)}:{}),
    ...(state.puzzleType==='ring-door'&&state.ringDoor?{puzzleType:'ring-door' as const,ringDoor:{...(state.ringDoor.symbols?{symbols:[...state.ringDoor.symbols] as [number,number,number]}:{}),positions:[...state.ringDoor.positions] as [number,number,number],opened:state.ringDoor.opened,moves:state.ringDoor.moves}}:{}),
    ...(state.puzzleType==='lockpick'&&state.lockpick?{puzzleType:'lockpick' as const,lockpick:{difficulty:state.lockpick.difficulty,pickHealth:state.lockpick.pickHealth,brokenPicks:state.lockpick.brokenPicks,attempts:state.lockpick.attempts,angle:state.lockpick.angle,turn:state.lockpick.turn,opened:state.lockpick.opened,probeActor:state.lockpick.probeActor,tensionMs:state.lockpick.tensionMs??0,binding:state.lockpick.binding??false,...(state.lockpick.travelLimit!==undefined?{travelLimit:state.lockpick.travelLimit}:{})}}:{}),
    ...(state.paused?{paused:true}:{}),
    ...(state.cubeFaces?{cubeFaces:[...state.cubeFaces]}:{}),
    ...(state.cubeDimensions?{cubeDimensions:{width:state.cubeDimensions.width,depth:state.cubeDimensions.depth,height:state.cubeDimensions.height}}:{}),
    missingCount: preparation.withheld.length + (preparation.hiddenInventory?.length ?? 0),
    missingSockets:[...new Set([...(preparation.startingWithheld ?? preparation.withheld).map(p=>p.index),...(preparation.hiddenInventory??[]).flatMap(p=>p.origin?[p.origin.index]:[])])].filter(index=>!state.tiles[index]),
    ...(state.placements ? {placements:state.placements.map(p=>({id:p.id,tileIndex:p.tileIndex}))} : {}),
    puzzleId: state.puzzleId,
    title: state.title,
    width: state.width,
    height: state.height,
    tiles: state.tiles.map(cloneTile),
    participants: state.participants.map(({ id, name }) => ({ id, name })),
    ...(state.rosterCustomized ? {rosterCustomized:true} : {}),
    activeIndex: state.activeIndex,
    mode: state.mode,
    turnEdit: state.turnEdit ? { tileIndex: state.turnEdit.tileIndex, originalRotation: state.turnEdit.originalRotation,
      ...(state.turnEdit.placedPiece ? { placedPiece: state.turnEdit.placedPiece } : {}) } : null,
    ...(state.inventory ? { inventory: state.inventory.map(p => ({ id: p.id, tile: cloneTile(p.tile)! })) } : {}),
    revision: state.revision,
    ...energy,
    connected: state.puzzleType==='challenge'?!!state.challenge?.opened:state.puzzleType==='ring-door'?!!state.ringDoor?.opened:state.puzzleType==='lockpick'?!!state.lockpick?.opened:energy.solved,
    solved: state.puzzleType==='challenge'?!!state.challenge?.opened:state.puzzleType==='ring-door'?!!state.ringDoor?.opened:state.puzzleType==='lockpick'?!!state.lockpick?.opened:energy.solved && state.turnEdit === null,
  };
}
