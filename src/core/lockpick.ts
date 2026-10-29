import type {Actor,Command,LockDifficulty,LockState,PrivatePreparation} from './state.ts';
import type {CommandResult,Rejection} from './commands.ts';

export const lockDifficulties = {
  novice:{name:'Novice',dc:5,tolerance:18},
  apprentice:{name:'Apprentice',dc:10,tolerance:12},
  adept:{name:'Adept',dc:15,tolerance:8},
  expert:{name:'Expert',dc:20,tolerance:4},
  master:{name:'Master',dc:25,tolerance:2},
} as const;
export function freshLock(difficulty:LockDifficulty):LockState {
  return{difficulty,pickHealth:100,brokenPicks:0,attempts:0,angle:0,turn:0,opened:false,probeActor:''};
}
export function createLock(difficulty:LockDifficulty,puzzleId:string,sweetSpot?:number):PrivatePreparation {
  const angle=sweetSpot??(crypto.getRandomValues(new Uint32Array(1))[0]%151-75);
  if(!Object.hasOwn(lockDifficulties,difficulty)||!Number.isInteger(angle)||Math.abs(angle)>75)throw new Error('Invalid lock settings.');
  const state:PrivatePreparation['state']={schemaVersion:2,puzzleId,title:'The warded lock',puzzleType:'lockpick',lockpick:freshLock(difficulty),width:0,height:0,tiles:[],participants:[{id:'lyra',name:'Lyra'},{id:'orin',name:'Orin'}],activeIndex:0,mode:'free',turnEdit:null,revision:0};
  return{state,seed:'',solution:[],withheld:[],lockSecret:{sweetSpot:angle},startingState:structuredClone(state)};
}
// Only the GM controller has the secret. The returned turn is the mechanical
// feedback from a player's chosen angle, never a published solution range.
export function lockTurn(angle:number,sweetSpot:number,difficulty:LockDifficulty):number {
  const tolerance=lockDifficulties[difficulty].tolerance,distance=Math.abs(angle-sweetSpot);
  if(distance<=tolerance)return 90;
  return Math.max(3,Math.round(82*(1-Math.min(1,(distance-tolerance)/35))));
}
export function applyLock(preparation:PrivatePreparation,command:Command,actor:Actor):{result:CommandResult;preparation:PrivatePreparation}|null {
  const state=preparation.state,lock=state.lockpick;
  const handled=['pick-lock','give-lockpick','complete-puzzle','reset-puzzle'];
  if(state.puzzleType!=='lockpick')return null;
  const reject=(reason:Rejection)=>({result:{accepted:false as const,state,reason},preparation});
  if(['rotate','select','place','gm-rotate','recall-piece','recover','hide-piece','return-piece'].includes(command.type))return reject('invalid-lock-action');
  if(!handled.includes(command.type))return null;
  if(!lock||!preparation.lockSecret)return reject('invalid-lock-action');
  if(command.type!=='pick-lock'&&actor.role!=='GM')return reject('gm-only');
  if(command.type==='pick-lock'){
    if(state.mode==='turns'&&!state.participants.some(p=>p.id===actor.id))return reject('unknown-player');
    if(state.mode==='turns'&&state.participants[state.activeIndex].id!==actor.id)return reject('wrong-turn');
    if(lock.opened)return reject('solved');
    if(lock.pickHealth===0)return reject('needs-lockpick');
    if(!Number.isInteger(command.angle)||Math.abs(command.angle)>90||typeof command.strain!=='boolean')return reject('invalid-lock-action');
    if(command.strain&&(lock.probeActor!==actor.id||lock.angle!==command.angle||lock.turn===90))return reject('stale-revision');
  }
  if(command.type==='give-lockpick'&&(lock.pickHealth!==0||lock.opened))return reject('invalid-lock-action');
  const next=structuredClone(preparation),value=next.state.lockpick!;
  if(command.type==='reset-puzzle')next.state.lockpick=freshLock(lock.difficulty);
  else if(command.type==='complete-puzzle'){value.opened=true;value.turn=90;value.probeActor='';}
  else if(command.type==='give-lockpick'){value.pickHealth=100;value.angle=0;value.turn=0;value.probeActor='';}
  else if(command.type==='pick-lock'){
    value.angle=command.angle;value.probeActor=actor.id;
    value.turn=lockTurn(command.angle,preparation.lockSecret.sweetSpot,value.difficulty);
    if(!command.strain)value.attempts++;
    value.opened=value.turn===90;
    if(command.strain&&!value.opened){value.pickHealth=Math.max(0,value.pickHealth-25);if(value.pickHealth===0){value.brokenPicks++;value.turn=0;value.probeActor='';}}
  }
  next.state.revision++;
  return{result:{accepted:true,state:next.state},preparation:next};
}
