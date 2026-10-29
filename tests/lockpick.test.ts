import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLock,lockDifficulties,lockTurn} from '../src/core/lockpick.ts';
import {applyAdventure} from '../src/core/adventure.ts';
import {projectPublic} from '../src/core/projection.ts';
import {encodePrivateSave,decodePrivateSave,encodePublicSave,validatePreparation} from '../src/core/save-format.ts';
import {parseRequest} from '../src/transport/protocol.ts';
import {PlayerRehearsal} from '../src/controller/player-rehearsal.ts';
import type {Actor,Command,PrivatePreparation} from '../src/core/state.ts';

test('five lock tiers have requested DC labels and strictly narrowing opening windows',()=>{
  assert.deepEqual(Object.values(lockDifficulties).map(d=>d.dc),[5,10,15,20,25]);
  let previous=181;
  for(const difficulty of Object.keys(lockDifficulties) as (keyof typeof lockDifficulties)[]){
    const opens=Array.from({length:181},(_,i)=>i-90).filter(angle=>lockTurn(angle,30,difficulty)===90);
    assert.ok(opens.length<previous);previous=opens.length;
    assert.equal(lockTurn(30,30,difficulty),90);assert.ok(lockTurn(-90,30,difficulty)<lockTurn(20,30,difficulty));
    assert.deepEqual(validatePreparation(createLock(difficulty,'lock',30)).state.lockpick,createLock(difficulty,'lock',30).state.lockpick);
  }
});
const player={id:'lyra',role:'PLAYER' as const},gm={id:'gm',role:'GM' as const};
function move(p:PrivatePreparation,command:Omit<Extract<Command,{type:'pick-lock'}>,'puzzleId'|'expectedRevision'>|{type:'give-lockpick'|'undo'|'reset-puzzle'|'complete-puzzle'|'pause-puzzle'|'resume-puzzle'},actor:Actor=player){return applyAdventure(p,{...command,puzzleId:p.state.puzzleId,expectedRevision:p.state.revision} as Command,actor);}
test('probing allows release without damage; forcing breaks a pick and only the GM can replace it',()=>{
  let p=createLock('master','lock',50);
  p=move(p,{type:'pick-lock',angle:-50,strain:false}).preparation;
  assert.equal(p.state.lockpick!.pickHealth,100);
  for(let i=0;i<4;i++)p=move(p,{type:'pick-lock',angle:-50,strain:true}).preparation;
  assert.equal(p.state.lockpick!.pickHealth,0);assert.equal(p.state.lockpick!.brokenPicks,1);
  assert.equal(move(p,{type:'pick-lock',angle:50,strain:false}).result.accepted,false);
  assert.equal(move(p,{type:'give-lockpick'}).result.accepted,false);
  p=move(p,{type:'give-lockpick'},gm).preparation;
  assert.equal(p.state.lockpick!.pickHealth,100);assert.equal(p.lockSecret!.sweetSpot,50);
  p=move(p,{type:'pick-lock',angle:50,strain:false}).preparation;
  assert.equal(projectPublic(p).solved,true);assert.equal(move(p,{type:'pick-lock',angle:0,strain:false}).result.accepted,false);
});
test('lock rules retain turn, pause, stale request, ownership and GM-only gates',()=>{
  let p=createLock('adept','lock',30);p.state.mode='turns';
  assert.equal(move(p,{type:'pick-lock',angle:0,strain:false},{id:'orin',role:'PLAYER'}).result.accepted,false);
  assert.equal(move(p,{type:'pick-lock',angle:0,strain:true}).result.accepted,false);
  p=move(p,{type:'pick-lock',angle:0,strain:false}).preparation;
  assert.equal(move(p,{type:'pick-lock',angle:1,strain:true}).result.accepted,false);
  const stale=applyAdventure(p,{type:'pick-lock',angle:30,strain:false,puzzleId:'lock',expectedRevision:0},player);assert.equal(stale.result.accepted,false);
  p=move(p,{type:'pause-puzzle'},gm).preparation;
  assert.equal(move(p,{type:'pick-lock',angle:30,strain:false}).result.accepted,false);
  for(const angle of [NaN,Infinity,1.5,91])assert.equal(parseRequest({id:'r',generation:'g',expiresAt:100,command:{type:'pick-lock',angle,strain:false,puzzleId:'lock',expectedRevision:0}}),null);
});
test('lock backups, undo and reset preserve the private opening angle without leaking it',()=>{
  let p=createLock('expert','lock',37);p=move(p,{type:'pick-lock',angle:-60,strain:false}).preparation;
  p=move(p,{type:'pick-lock',angle:-60,strain:true}).preparation;
  const restored=decodePrivateSave(encodePrivateSave(p));assert.equal(restored.lockSecret!.sweetSpot,37);assert.equal(restored.state.lockpick!.pickHealth,75);
  for(const secret of ['sweetSpot','lockSecret','tolerance','solution','actionHistory'])assert.ok(!encodePublicSave(p).includes(secret));
  const undone=move(restored,{type:'undo'},gm).preparation;assert.equal(undone.state.lockpick!.pickHealth,100);
  const reset=move(restored,{type:'reset-puzzle'},gm).preparation;assert.equal(reset.state.lockpick!.attempts,0);assert.equal(reset.lockSecret!.sweetSpot,37);
  assert.throws(()=>validatePreparation({...p,lockSecret:{sweetSpot:NaN}}));
  assert.throws(()=>validatePreparation({...p,state:{...p.state,tiles:[null]}}));
  const view=projectPublic(p);(view.lockpick as any).sweetSpot=37;assert.ok(!JSON.stringify(projectPublic({...p,state:view})).includes('sweetSpot'));
});
test('lock player rehearsal uses a detached private copy and never changes the shared puzzle',()=>{
  const p=createLock('novice','lock',25),before=JSON.stringify(p);
  const rehearsal=new PlayerRehearsal(projectPublic(p),'relay',p);
  const result=rehearsal.request({type:'pick-lock',angle:25,strain:false,puzzleId:'lock',expectedRevision:0},'lyra',false);
  assert.equal(result.accepted,true);assert.equal(result.snapshot.solved,true);assert.equal(JSON.stringify(p),before);
});
