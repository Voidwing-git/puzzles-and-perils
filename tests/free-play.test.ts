import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture} from '../src/core/fixtures.ts';
import {applyAdventure} from '../src/core/adventure.ts';
import {SharedController} from '../src/controller/shared-controller.ts';
import {KEY} from '../src/transport/protocol.ts';
import type {Shared,Request} from '../src/transport/protocol.ts';
import type {Peer} from '../src/controller/shared-controller.ts';
import type {Command,PrivatePreparation} from '../src/core/state.ts';
import {decodePrivateSave,encodePrivateSave,encodePublicSave} from '../src/core/save-format.ts';

const gm={id:'gm',role:'GM' as const,name:'Keeper'},late={id:'late',role:'PLAYER' as const,name:'Late arrival'};
const command=(p:PrivatePreparation,type:Command['type'],extra:object={}):Command=>({type,puzzleId:p.state.puzzleId,expectedRevision:p.state.revision,...extra} as Command);
test('free play permits an authenticated unlisted member to place, rotate and recall; turns and pause still restrict',()=>{
  let p=createFixture('relay','room-free');p.state.mode='free';p.state.participants=[{id:'gm',name:'Keeper'}];
  const tile=p.state.tiles[6]!;p.state.tiles[6]=null;p.state.inventory=[{id:'recovered-1',tile}];
  for(const [type,extra]of [['place',{tileIndex:6,pieceId:'recovered-1'}],['rotate',{tileIndex:6}],['return-piece',{pieceId:'recovered-1'}]] as const){
    const next=applyAdventure(p,command(p,type,extra),late);assert.equal(next.result.accepted,true);p=next.preparation;
  }
  assert.equal(p.state.tiles[6],null);assert.equal(p.state.inventory?.length,1);
  p.state.mode='turns';assert.equal(applyAdventure(p,command(p,'place',{tileIndex:6,pieceId:'recovered-1'}),late).result.accepted,false);
  p.state.mode='free';p.state.paused=true;assert.equal(applyAdventure(p,command(p,'place',{tileIndex:6,pieceId:'recovered-1'}),late).result.accepted,false);
  for(const type of ['undo','pause-puzzle','resume-puzzle','complete-puzzle'] as const)assert.equal(applyAdventure(p,command(p,type),late).result.accepted,false);
});
test('enabling turns loads the live roster while preserving an intentionally customized order',()=>{
  const p=createFixture('relay','room-turns');p.state.mode='free';p.state.participants=[{id:'gm',name:'Keeper'}];
  const live=[{id:'late',name:'Late arrival'},{id:'other',name:'Other player'}];
  const result=applyAdventure(p,command(p,'set-mode',{mode:'turns'}),gm,'relay',live);
  assert.deepEqual(result.preparation.state.participants,live);
  p.state.rosterCustomized=true;
  assert.deepEqual(applyAdventure(p,command(p,'set-mode',{mode:'turns'}),gm,'relay',live).preparation.state.participants,p.state.participants);
});
test('shared free play authenticates live membership even when the saved roster is stale',async()=>{
  let metadata:Record<string,unknown>={};let peers:Peer[]=[{...gm,connectionId:'g'}];let writes=0;
  const controller=new SharedController('g',{peers:async()=>structuredClone(peers),read:async()=>structuredClone(metadata),write:async update=>{writes++;metadata={...metadata,...structuredClone(update)};}});
  await controller.submit({id:'start',generation:'start',expiresAt:Date.now()+6000,command:{type:'advance-turn',puzzleId:'start',expectedRevision:0}},'g');
  const shared=()=>metadata[KEY] as Shared;
  const request=(id:string,c:object):Request=>({id,generation:shared().generation,expiresAt:Date.now()+6000,command:{puzzleId:shared().puzzle.puzzleId,expectedRevision:shared().puzzle.revision,...c} as Command});
  await controller.submit(request('free',{type:'set-mode',mode:'free'}),'g');
  peers=[...peers,{...late,connectionId:'late-connection'}];
  assert.equal(shared().puzzle.participants.some(p=>p.id==='late'),false);
  await controller.submit(request('move',{type:'rotate',tileIndex:6}),'late-connection');assert.equal(shared().receipts.at(-1)?.accepted,true);
  const count=writes;await controller.submit(request('spoof',{type:'rotate',tileIndex:6}),'not-in-room');assert.equal(writes,count);
});
test('event history records names, time and coordinates privately and round trips legacy backups',()=>{
  let p=createFixture('relay','history-private');p.state.mode='free';
  p=applyAdventure(p,command(p,'rotate',{tileIndex:6}),late).preparation;
  const event=p.actionHistory!.at(-1)!;assert.equal(event.name,'Late arrival');assert.match(event.detail!,/B2/);assert.equal(typeof event.at,'number');
  assert.deepEqual(decodePrivateSave(encodePrivateSave(p)).actionHistory,p.actionHistory);
  const publicData=encodePublicSave(p);for(const value of ['Late arrival',event.detail!,'actionHistory'])assert.ok(!publicData.includes(value));
  p.actionHistory=[{revision:1,action:'rotate',actor:'lyra'}];assert.deepEqual(decodePrivateSave(encodePrivateSave(p)).actionHistory,p.actionHistory);
});
