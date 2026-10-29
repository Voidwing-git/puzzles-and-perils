import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRingDoor,ringSymbols,validRingPositions} from '../src/core/ring-door.ts';
import {applyAdventure} from '../src/core/adventure.ts';
import {projectPublic} from '../src/core/projection.ts';
import {encodePrivateSave,decodePrivateSave,encodePublicSave,validatePreparation} from '../src/core/save-format.ts';
import {parseRequest} from '../src/transport/protocol.ts';
import {PlayerRehearsal} from '../src/controller/player-rehearsal.ts';
import type {Actor,Command,PrivatePreparation} from '../src/core/state.ts';

const player:Actor={id:'lyra',role:'PLAYER'},gm:Actor={id:'gm',role:'GM'};
function move(p:PrivatePreparation,command:{type:'rotate-ring';ring:number}|{type:'undo'|'reset-puzzle'|'complete-puzzle'|'pause-puzzle'|'resume-puzzle'|'advance-turn'},actor=player){
  return applyAdventure(p,{...command,puzzleId:p.state.puzzleId,expectedRevision:p.state.revision} as Command,actor);
}

test('three original symbols and fresh doors always start unsolved',()=>{
  assert.deepEqual(ringSymbols,['Bear','Moth','Owl']);
  for(let i=0;i<40;i++){
    const p=createRingDoor('door');assert.equal(projectPublic(p).solved,false);
    assert.ok(validRingPositions(p.state.ringDoor!.positions));assert.ok(validRingPositions(p.ringSecret!.targets));
    assert.notDeepEqual(p.state.ringDoor!.positions,p.ringSecret!.targets);assert.deepEqual(validatePreparation(p),p);
  }
  for(const value of [[0,1],[0,1,3],[NaN,1,2],['0',1,2]])assert.equal(validRingPositions(value),false);
});

test('ring rotations wrap, preserve the other rings and open only at the whole combination',()=>{
  let p=createRingDoor('door',[0,1,2],[2,0,1]);
  p=move(p,{type:'rotate-ring',ring:0}).preparation;
  assert.deepEqual(p.state.ringDoor!.positions,[0,0,1]);assert.equal(projectPublic(p).solved,false);
  p=move(p,{type:'rotate-ring',ring:1}).preparation;assert.equal(projectPublic(p).solved,false);
  p=move(p,{type:'rotate-ring',ring:2}).preparation;
  assert.equal(projectPublic(p).solved,true);assert.equal(p.state.ringDoor!.moves,3);
  assert.equal(move(p,{type:'rotate-ring',ring:0}).result.accepted,false);
});

test('ring actions retain current-turn, pause, actor, revision and GM-only protections',()=>{
  let p=createRingDoor('door',[0,1,2],[2,0,1]);p.state.mode='turns';
  assert.equal(move(p,{type:'rotate-ring',ring:0},{id:'orin',role:'PLAYER'}).result.accepted,false);
  assert.equal(move(p,{type:'rotate-ring',ring:0},{id:'outside',role:'PLAYER'}).result.accepted,false);
  assert.equal(move(p,{type:'complete-puzzle'}).result.accepted,false);
  assert.equal(move(p,{type:'reset-puzzle'}).result.accepted,false);
  for(const ring of [-1,3,1.5,NaN])assert.equal(move(p,{type:'rotate-ring',ring}).result.accepted,false);
  p=move(p,{type:'rotate-ring',ring:0}).preparation;
  assert.equal(applyAdventure(p,{type:'rotate-ring',ring:1,puzzleId:'door',expectedRevision:0},player).result.accepted,false);
  p=move(p,{type:'pause-puzzle'},gm).preparation;assert.equal(move(p,{type:'rotate-ring',ring:1}).result.accepted,false);
  p=move(p,{type:'resume-puzzle'},gm).preparation;p=move(p,{type:'advance-turn'}).preparation;
  assert.equal(p.state.activeIndex,1);assert.equal(move(p,{type:'rotate-ring',ring:1}).result.accepted,false);
  assert.equal(move(p,{type:'rotate-ring',ring:1},{id:'orin',role:'PLAYER'}).result.accepted,true);
  for(const ring of [-1,3,1.5])assert.equal(parseRequest({id:'r',generation:'g',expiresAt:100,command:{type:'rotate-ring',ring,puzzleId:'door',expectedRevision:0}}),null);
});

test('ring private saves, undo, reset and solve preserve targets without public disclosure',()=>{
  let p=createRingDoor('door',[0,1,2],[2,0,1]);p=move(p,{type:'rotate-ring',ring:0}).preparation;
  const restored=decodePrivateSave(encodePrivateSave(p));assert.deepEqual(restored.ringSecret!.targets,[0,1,2]);
  assert.ok(!encodePublicSave(p).includes('ringSecret'));assert.ok(!encodePublicSave(p).includes('actionHistory'));
  const polluted=structuredClone(p);Object.assign(polluted.state.ringDoor!,{targets:[0,1,2],gmNote:'private-note'});
  assert.deepEqual(Object.keys(projectPublic(polluted).ringDoor!).sort(),['moves','opened','positions']);
  assert.equal(JSON.stringify(projectPublic(polluted)).includes('private-note'),false);
  const undone=move(restored,{type:'undo'},gm).preparation;assert.deepEqual(undone.state.ringDoor!.positions,[2,0,1]);
  const solved=move(restored,{type:'complete-puzzle'},gm).preparation;assert.deepEqual(solved.state.ringDoor!.positions,[0,1,2]);assert.equal(solved.state.ringDoor!.opened,true);
  const reset=move(solved,{type:'reset-puzzle'},gm).preparation;assert.deepEqual(reset.state.ringDoor!.positions,[2,0,1]);assert.equal(reset.state.ringDoor!.opened,false);
  assert.throws(()=>validatePreparation({...p,ringSecret:{targets:[0,1,3]}}));
  assert.throws(()=>validatePreparation({...p,state:{...p.state,ringDoor:{...p.state.ringDoor!,opened:true}}}));
});

test('ring rehearsal opens a detached copy without changing the shared source',()=>{
  const p=createRingDoor('door',[0,1,2],[2,1,2]),before=JSON.stringify(p),rehearsal=new PlayerRehearsal(projectPublic(p),'relay',p);
  const result=rehearsal.request({type:'rotate-ring',ring:0,puzzleId:'door',expectedRevision:0},'lyra',false);
  assert.equal(result.accepted,true);assert.equal(result.snapshot.solved,true);assert.equal(JSON.stringify(p),before);
});
