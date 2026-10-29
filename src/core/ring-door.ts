import type {Actor,Command,PrivatePreparation,RingDoorState} from './state.ts';
import type {CommandResult,Rejection} from './commands.ts';

export const ringSymbols=['Bear','Moth','Owl','Wolf','Serpent','Stag','Fox','Raven','Dragon'] as const;
export const ringNames=['Outer','Middle','Inner'] as const;
export const RING_STEPS=3;
export type RingPositions=[number,number,number];
export type RingSymbols=[number,number,number];
export const LEGACY_RING_SYMBOLS:RingSymbols=[0,1,2];

export function validRingPositions(value:unknown):value is RingPositions {
  return Array.isArray(value)&&value.length===3&&value.every(n=>Number.isInteger(n)&&n>=0&&n<RING_STEPS);
}
export function validRingSymbols(value:unknown):value is RingSymbols {
  return Array.isArray(value)&&value.length===RING_STEPS&&new Set(value).size===RING_STEPS&&value.every(n=>Number.isInteger(n)&&n>=0&&n<ringSymbols.length);
}
export function effectiveRingSymbols(door:Pick<RingDoorState,'symbols'>):RingSymbols {
  return [...(door.symbols??LEGACY_RING_SYMBOLS)];
}
export function randomRingSymbols(previous?:RingSymbols):RingSymbols {
  const pool=Array.from({length:ringSymbols.length},(_,i)=>i),random=crypto.getRandomValues(new Uint32Array(pool.length));
  for(let i=pool.length-1;i>0;i--){const at=random[i]%(i+1);[pool[i],pool[at]]=[pool[at],pool[i]];}
  const chosen=pool.slice(0,RING_STEPS) as RingSymbols;
  // A press of Randomize visibly changes the actual symbol set, not just its order.
  if(previous&&chosen.every(symbol=>previous.includes(symbol)))chosen[0]=pool.find(symbol=>!previous.includes(symbol))!;
  return chosen;
}
const randomPositions=():RingPositions=>Array.from(crypto.getRandomValues(new Uint32Array(3)),n=>n%RING_STEPS) as RingPositions;
const aligned=(positions:RingPositions,targets:RingPositions)=>positions.every((position,i)=>position===targets[i]);

export function createRingDoor(puzzleId:string,targets:RingPositions=randomPositions(),positions?:RingPositions,symbols:RingSymbols=LEGACY_RING_SYMBOLS):PrivatePreparation {
  if(!validRingPositions(targets)||(positions!==undefined&&!validRingPositions(positions))||!validRingSymbols(symbols))throw new Error('Invalid ring settings.');
  const start:RingPositions=positions?[...positions]:randomPositions();
  // A new door always needs at least one move, even after a random coincidence.
  if(aligned(start,targets))start[0]=(start[0]+1)%RING_STEPS;
  const ringDoor:RingDoorState={positions:start,opened:false,moves:0,symbols:[...symbols]};
  const state:PrivatePreparation['state']={schemaVersion:2,puzzleId,title:'The sealed ring door',puzzleType:'ring-door',ringDoor,width:0,height:0,tiles:[],participants:[{id:'lyra',name:'Lyra'},{id:'orin',name:'Orin'}],activeIndex:0,mode:'free',turnEdit:null,revision:0};
  return{state,seed:'',solution:[],withheld:[],ringSecret:{targets:[...targets]},startingState:structuredClone(state)};
}

export function randomizeRingDoor(puzzleId:string,previous?:PrivatePreparation):PrivatePreparation {
  const oldSymbols=previous?.state.ringDoor?effectiveRingSymbols(previous.state.ringDoor):undefined;
  const symbols=randomRingSymbols(oldSymbols),targets=randomPositions(),oldTargets=previous?.ringSecret?.targets;
  if(oldTargets&&aligned(targets,oldTargets))targets[0]=(targets[0]+1)%RING_STEPS;
  if(oldTargets&&oldSymbols&&targets.every((slot,i)=>symbols[slot]===oldSymbols[oldTargets[i]]))targets[0]=(targets[0]+1)%RING_STEPS;
  return createRingDoor(puzzleId,targets,undefined,symbols);
}

// Common pause, revision, history and publication guards live in applyAdventure.
export function applyRingDoor(preparation:PrivatePreparation,command:Command,actor:Actor):{result:CommandResult;preparation:PrivatePreparation}|null {
  const state=preparation.state;
  if(state.puzzleType!=='ring-door')return null;
  const reject=(reason:Rejection)=>({result:{accepted:false as const,state,reason},preparation});
  if(['rotate','select','place','gm-rotate','recall-piece','recover','hide-piece','return-piece','pick-lock','give-lockpick'].includes(command.type))return reject('invalid-ring-action');
  if(!['rotate-ring','reset-puzzle','complete-puzzle'].includes(command.type))return null;
  const door=state.ringDoor,secret=preparation.ringSecret;
  if(!door||!secret||!validRingPositions(door.positions)||!validRingPositions(secret.targets)||!validRingSymbols(effectiveRingSymbols(door)))return reject('invalid-ring-action');
  if(command.type==='rotate-ring'){
    if(!Number.isInteger(command.ring)||command.ring<0||command.ring>2)return reject('invalid-ring-action');
    if(state.mode==='turns'&&!state.participants.some(p=>p.id===actor.id))return reject('unknown-player');
    if(state.mode==='turns'&&state.participants[state.activeIndex].id!==actor.id)return reject('wrong-turn');
    if(door.opened)return reject('solved');
  }else if(actor.role!=='GM')return reject('gm-only');
  const next=structuredClone(preparation),value=next.state.ringDoor!;
  if(command.type==='rotate-ring'){
    value.positions[command.ring]=(value.positions[command.ring]+1)%RING_STEPS;
    value.moves++;
    value.opened=aligned(value.positions,secret.targets);
  }else if(command.type==='complete-puzzle'){
    value.positions=[...secret.targets];value.opened=true;
  }else if(command.type==='reset-puzzle'){
    const start=next.startingState?.ringDoor?.positions??[0,0,0];
    value.positions=[...start] as RingPositions;value.moves=0;value.opened=false;
    if(aligned(value.positions,secret.targets))value.positions[0]=(value.positions[0]+1)%RING_STEPS;
  }
  next.state.revision++;
  return{result:{accepted:true,state:next.state},preparation:next};
}
