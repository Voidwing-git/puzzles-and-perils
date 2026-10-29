import { applyAdmin } from './admin.ts';
import { applyCommand } from './commands.ts';
import type { CommandResult } from './commands.ts';
import type { Actor, Command, Direction, Participant, PrivatePreparation } from './state.ts';
import type { FixtureId } from './fixtures.ts';
import {puzzleEvent} from './event-history.ts';
import {applyLock} from './lockpick.ts';

function transitionAdventure(preparation: PrivatePreparation, command: Command, actor: Actor, fixture: FixtureId = 'relay', roster?: Participant[]): { result: CommandResult; preparation: PrivatePreparation } {
  const state = preparation.state;
  const lockResult=applyLock(preparation,command,actor);if(lockResult)return lockResult;
  const reject = (reason: 'wrong-puzzle' | 'stale-revision' | 'gm-only' | 'invalid-tile') => ({ result: { accepted: false as const, state, reason }, preparation });
  if (command.type === 'gm-rotate' || command.type === 'recall-piece') {
    if (command.puzzleId !== state.puzzleId) return reject('wrong-puzzle');
    if (command.expectedRevision !== state.revision) return reject('stale-revision');
    if (actor.role !== 'GM') return reject('gm-only');
    const tile = state.tiles[command.tileIndex];
    if (!Number.isInteger(command.tileIndex) || !tile || tile.terminal || state.turnEdit) return reject('invalid-tile');
    const next = structuredClone(preparation);
    if (command.type === 'gm-rotate') next.state.tiles[command.tileIndex] = { ...tile, rotation: ((tile.rotation + 1) % 4) as Direction };
    else {
      next.state.tiles[command.tileIndex] = null;
      next.state.placements = next.state.placements?.filter(p=>p.tileIndex!==command.tileIndex);
      const inventoryId = `recovered-${state.revision}`;
      next.state.inventory = [...(next.state.inventory ?? []), { id: inventoryId, tile: { shape: tile.shape, rotation: 0 } }];
      next.trayOrigins = {...next.trayOrigins,[inventoryId]: {id:`removed-${state.revision}`,index:command.tileIndex,tile:{...tile},discoveryLabel:'Returned board piece'}};
    }
    next.state.revision++;
    return { result: { accepted: true, state: next.state }, preparation: next };
  }
  if (command.type === 'recover' || command.type === 'hide-piece' || command.type === 'reset-puzzle' || command.type === 'complete-puzzle') {
    if (command.puzzleId !== state.puzzleId) return reject('wrong-puzzle');
    if (command.expectedRevision !== state.revision) return reject('stale-revision');
    if (actor.role !== 'GM') return reject('gm-only');
    const next = structuredClone(preparation);
    if (command.type === 'hide-piece') {
      const piece = next.state.inventory?.find(p => p.id === command.pieceId);
      if (!piece || state.turnEdit) return reject('invalid-tile');
      next.hiddenInventory = [...(next.hiddenInventory ?? []), { ...piece, ...(next.trayOrigins?.[piece.id] ? {origin:next.trayOrigins[piece.id]} : {}) }];
      next.state.inventory = next.state.inventory!.filter(p => p.id !== piece.id);
    } else if (command.type === 'recover') {
      const hidden = next.hiddenInventory?.find(p => p.id === command.pieceId);
      if (hidden) {
        if (state.turnEdit) return reject('invalid-tile');
        if (command.destination === 'socket') {
          if (!hidden.origin || next.state.tiles[hidden.origin.index]) return reject('invalid-tile');
          next.state.tiles[hidden.origin.index] = {...hidden.origin.tile};
          next.state.placements = [...(next.state.placements??[]),{id:hidden.id,tileIndex:hidden.origin.index}];
          next.recoveryDestinations = {...next.recoveryDestinations,[hidden.origin.index]:'socket'};
        } else {
          next.state.inventory = [...(next.state.inventory ?? []), {id:hidden.id,tile:{...hidden.tile}}];
          if(hidden.origin) next.trayOrigins = {...next.trayOrigins,[hidden.id]:structuredClone(hidden.origin)};
        }
        next.hiddenInventory = next.hiddenInventory!.filter(p=>p.id!==hidden.id);
        next.state.revision++; return {result:{accepted:true,state:next.state},preparation:next};
      }
      const piece = next.withheld.find(p => p.id === command.pieceId);
      if (!piece || state.turnEdit) return reject('invalid-tile');
      const destination = command.destination ?? next.recoveryMode ?? 'socket';
      if (destination === 'tray') {
        const inventoryId = `recovered-${state.revision}`;
        next.state.inventory = [...(next.state.inventory ?? []), { id: inventoryId, tile: { shape: piece.tile.shape, rotation: 0 } }];
        next.trayOrigins = {...next.trayOrigins, [inventoryId]:structuredClone(piece)};
      } else {
        if (next.state.tiles[piece.index]) return reject('invalid-tile');
        next.state.tiles[piece.index] = { ...piece.tile };
        const inventoryId=`recovered-${state.revision}`;
        next.state.placements=[...(next.state.placements??[]),{id:inventoryId,tileIndex:piece.index}];
        next.trayOrigins={...next.trayOrigins,[inventoryId]:structuredClone(piece)};
      }
      next.recoveryDestinations = { ...next.recoveryDestinations, [piece.index]: destination };
      next.withheld = next.withheld.filter(p => p.index !== piece.index);
    } else if (command.type === 'reset-puzzle') {
      next.state = { ...structuredClone(next.startingState ?? state), participants: structuredClone(state.participants), mode: state.mode, activeIndex: 0 };
      const recovered = (next.startingWithheld ?? []).filter(p => !next.withheld.some(w => w.index === p.index));
      const hidden = [...(next.hiddenInventory ?? [])];
      const trayPieces = recovered.filter(p => {
        const at = hidden.findIndex(h => h.origin ? h.origin.index === p.index : h.tile.shape === p.tile.shape);
        if (at >= 0) { hidden.splice(at,1); return false; }
        return true;
      }).filter(p => (next.recoveryDestinations?.[p.index] ?? next.recoveryMode) === 'tray');
      next.state.inventory = [...(next.state.inventory ?? []).filter(p=>!next.hiddenInventory?.some(h=>h.id===p.id)), ...trayPieces.map((p, i) => ({ id: `recovered-${state.revision}-${i}`, tile: { shape: p.tile.shape, rotation: 0 as const } }))];
      for (const h of next.hiddenInventory ?? []) if(h.origin) next.state.tiles[h.origin.index] = null;
      next.trayOrigins = {...next.trayOrigins,...Object.fromEntries(trayPieces.map((p,i) => [`recovered-${state.revision}-${i}`,structuredClone(p)]))};
      next.state.placements=next.state.placements?.filter(p=>!!next.state.tiles[p.tileIndex]);
      for (const [i,p] of recovered.filter(p => !trayPieces.includes(p) && (next.recoveryDestinations?.[p.index] ?? next.recoveryMode) !== 'tray').entries()) {
        next.state.tiles[p.index] = { ...p.tile };
        const id=`recovered-${state.revision}-${trayPieces.length+i}`;
        next.state.placements=[...(next.state.placements??[]),{id,tileIndex:p.index}];
        next.trayOrigins[id]=structuredClone(p);
      }
    } else {
      next.state.tiles = structuredClone(next.solution);
      next.withheld = []; next.hiddenInventory = []; next.state.inventory = []; next.trayOrigins = {};
      next.state.placements = (next.startingWithheld??[]).map((p,i)=>({id:`recovered-${state.revision}-${i}`,tileIndex:p.index}));
      for(const placement of next.state.placements) {const origin=next.startingWithheld!.find(p=>p.index===placement.tileIndex)!;next.trayOrigins[placement.id]=structuredClone(origin);}
      next.recoveryDestinations = Object.fromEntries((next.startingWithheld ?? []).map(p=>[p.index,'socket' as const]));
    }
    next.state.turnEdit = null;
    next.state.revision = state.revision + 1;
    return { result: { accepted: true, state: next.state }, preparation: next };
  }
  const result = applyAdmin(state, command, actor, fixture, roster) ?? applyCommand(state, command, actor, roster);
  return { result, preparation: result.accepted ? { ...preparation, state: result.state } : preparation };
}

export function applyAdventure(preparation:PrivatePreparation,command:Command,actor:Actor,fixture:FixtureId='relay',roster?:Participant[]):{result:CommandResult;preparation:PrivatePreparation}{
  const state=preparation.state;
  const reject=(reason:import('./commands.ts').Rejection)=>({result:{accepted:false as const,state,reason},preparation});
  if(command.puzzleId!==state.puzzleId)return reject('wrong-puzzle');
  if(command.expectedRevision!==state.revision)return reject('stale-revision');
  let result:{result:CommandResult;preparation:PrivatePreparation};
  if(['undo','pause-puzzle','resume-puzzle'].includes(command.type)){
    if(actor.role!=='GM')return reject('gm-only');
    if(command.type==='undo'){
      const previous=preparation.history?.at(-1);if(!previous)return reject('no-history');
      const next=JSON.parse(previous) as PrivatePreparation;
      next.state.puzzleId=state.puzzleId;next.state.revision=state.revision+1;
      if(next.startingState)next.startingState.puzzleId=state.puzzleId;
      next.history=preparation.history!.slice(0,-1);
      next.actionHistory=[...(preparation.actionHistory??[]).slice(-31),puzzleEvent(preparation,command,actor,next.state.revision)];
      return{result:{accepted:true,state:next.state},preparation:next};
    }
    const next=structuredClone(preparation);next.state.paused=command.type==='pause-puzzle';next.state.revision++;
    result={result:{accepted:true,state:next.state},preparation:next};
  }else{
    if(state.paused)return reject('paused');
    result=transitionAdventure(preparation,command,actor,fixture,roster);
  }
  if(result.result.accepted&&result.result.state.revision!==state.revision){
    const checkpoint=structuredClone(preparation);delete checkpoint.history;delete checkpoint.actionHistory;
    result.preparation.history=[...(preparation.history??[]).slice(-11),JSON.stringify(checkpoint)];
    while(result.preparation.history.length&&new TextEncoder().encode(JSON.stringify(result.preparation.history)).length>512*1024)result.preparation.history.shift();
    result.preparation.actionHistory=[...(preparation.actionHistory??[]).slice(-31),puzzleEvent(preparation,command,actor,result.result.state.revision)];
  }
  return result;
}
