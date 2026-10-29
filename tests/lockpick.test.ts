import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLock,lockDifficulties,lockTurn,LOCK_OPEN_MS,LOCK_TICK_MS} from '../src/core/lockpick.ts';
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
function hold(p:PrivatePreparation,angle:number,steps=LOCK_OPEN_MS/LOCK_TICK_MS){for(let i=0;i<steps;i++)p=move(p,{type:'pick-lock',angle,strain:true}).preparation;return p;}
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
  assert.equal(projectPublic(p).solved,false);p=hold(p,50);
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
  const restored=decodePrivateSave(encodePrivateSave(p));assert.equal(restored.lockSecret!.sweetSpot,37);assert.equal(restored.state.lockpick!.pickHealth,80);
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
  let result=rehearsal.request({type:'pick-lock',angle:25,strain:false,puzzleId:'lock',expectedRevision:0},'lyra',false);
  assert.equal(result.snapshot.solved,false);
  for(let i=0;i<LOCK_OPEN_MS/LOCK_TICK_MS;i++)result=rehearsal.request({type:'pick-lock',angle:25,strain:true,puzzleId:'lock',expectedRevision:result.snapshot.revision},'lyra',false);
  assert.equal(result.accepted,true);assert.equal(result.snapshot.solved,true);assert.equal(JSON.stringify(p),before);
});

test('opening needs a sustained hold and repeated short presses reset progress',()=>{
  let p=createLock('master','lock',30);
  for(let tap=0;tap<5;tap++){
    p=move(p,{type:'pick-lock',angle:30,strain:false}).preparation;
    assert.equal(p.state.lockpick!.turn,0);p=hold(p,30,3);
    assert.equal(p.state.lockpick!.opened,false);assert.equal(p.state.lockpick!.pickHealth,100);
  }
  p=hold(p,30,4);assert.equal(p.state.lockpick!.opened,true);
});

test('closer angles allow more travel and harder tiers shorten the binding grace',()=>{
  const near=hold(move(createLock('adept','near',30),{type:'pick-lock',angle:20,strain:false}).preparation,20);
  const far=hold(move(createLock('adept','far',30),{type:'pick-lock',angle:-60,strain:false}).preparation,-60);
  assert.ok(near.state.lockpick!.turn>far.state.lockpick!.turn);
  assert.equal(near.state.lockpick!.opened,false);assert.equal(near.state.lockpick!.binding,true);
  let previous=Infinity;
  for(const difficulty of Object.keys(lockDifficulties) as (keyof typeof lockDifficulties)[]){
    let p=move(createLock(difficulty,'lock',50),{type:'pick-lock',angle:-90,strain:false}).preparation,steps=0;
    while(p.state.lockpick!.pickHealth>0){p=hold(p,-90,1);steps++;assert.ok(steps<=20);}
    assert.ok(steps<previous);previous=steps;
  }
});

test('older locks remain loadable and partial holds cannot skip opening after restore',()=>{
  const old=createLock('novice','lock',30);
  delete old.state.lockpick!.tensionMs;delete old.state.lockpick!.binding;
  delete old.startingState!.lockpick!.tensionMs;delete old.startingState!.lockpick!.binding;
  const restored=decodePrivateSave(encodePrivateSave(old));assert.equal(restored.state.lockpick!.tensionMs,0);
  const partial=hold(move(restored,{type:'pick-lock',angle:30,strain:false}).preparation,30,6);
  const resumed=move(decodePrivateSave(encodePrivateSave(partial)),{type:'pick-lock',angle:30,strain:false}).preparation;
  assert.equal(resumed.state.lockpick!.turn,0);assert.equal(resumed.state.lockpick!.opened,false);
});
