import {boardCoordinate} from './pieces.ts';
import type {Actor,Command,PrivatePreparation} from './state.ts';

export function puzzleEvent(preparation:PrivatePreparation,command:Command,actor:Actor,revision:number,description?:string){
  const state=preparation.state;
  const position=(index:number)=>boardCoordinate(state,index);
  let detail=description;
  if(!detail){
    switch(command.type){
      case 'challenge-action':detail=`${state.challenge?.kind??'Challenge'}: ${command.action.op}`;break;
      case 'rotate-ring':detail=`Rotated the ${['outer','middle','inner'][command.ring]} door ring`;break;
      case 'pick-lock':detail=command.strain?'Applied pressure to the lock':'Tested a lockpick angle';break;
      case 'give-lockpick':detail='Gave the players another lockpick';break;
      case 'rotate':case 'gm-rotate':detail=`Rotated ${position(command.tileIndex)} clockwise`;break;
      case 'select':detail='Returned the previous turn preview';break;
      case 'place':detail=`Placed a recovered piece at ${position(command.tileIndex)}`;break;
      case 'recall-piece':detail=`Returned ${position(command.tileIndex)} to the tray`;break;
      case 'return-piece':{const placed=state.placements?.find(p=>p.id===command.pieceId);detail=placed?`Returned ${position(placed.tileIndex)} to the tray`:'Recalled a piece to the tray';break;}
      case 'recover':{const origin=preparation.withheld.find(p=>p.id===command.pieceId)??preparation.hiddenInventory?.find(p=>p.id===command.pieceId)?.origin;const where=origin?` (${position(origin.index)})`:'';detail=(command.destination??preparation.recoveryMode)==='tray'?`Gave a piece${where} to players`:`Restored a missing piece${where}`;break;}
      case 'hide-piece':detail='Hid a recovered piece';break;
      case 'advance-turn':detail='Ended the turn';break;
      case 'set-mode':detail=command.mode==='free'?'Enabled free play':'Enabled turns';break;
      case 'set-roster':case 'sync-players':detail='Updated the turn order';break;
      case 'complete-puzzle':detail='Solved the puzzle';break;
      case 'reset-puzzle':detail='Reset the puzzle';break;
      case 'undo':detail='Undid the previous action';break;
      case 'pause-puzzle':detail='Paused the puzzle';break;
      case 'resume-puzzle':detail='Resumed the puzzle';break;
      case 'restore-draft':detail='Restored a private backup';break;
      case 'publish-draft':detail='Saved the puzzle';break;
    }
  }
  const name=(actor.name??state.participants.find(p=>p.id===actor.id)?.name??(actor.role==='GM'?'GM':'Room player')).slice(0,128);
  return{revision,action:command.type,actor:actor.id,name,at:Date.now(),detail:detail!.slice(0,240)};
}
