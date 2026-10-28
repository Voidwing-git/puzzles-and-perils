import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture} from '../src/core/fixtures.ts';
import {generateCube} from '../src/core/cube-generator.ts';
import {applyAdventure} from '../src/core/adventure.ts';
import {projectPublic} from '../src/core/projection.ts';
import {encodePrivateSave,decodePrivateSave,encodePublicSave,MAX_SAVE_BYTES} from '../src/core/save-format.ts';
import {LocalController} from '../src/controller/local-controller.ts';
import type {Command,PrivatePreparation} from '../src/core/state.ts';
import {SharedController} from '../src/controller/shared-controller.ts';
import {savePrivate,readPrivate} from '../src/core/private-store.ts';
import {KEY} from '../src/transport/protocol.ts';
import type {Shared,Request} from '../src/transport/protocol.ts';
import {rekeyPreparation} from '../src/core/save-format.ts';

const gm={id:'gm',role:'GM' as const},player={id:'lyra',role:'PLAYER' as const};
const command=(p:Pick<PrivatePreparation,'state'>,type:Command['type'],extra:object={}):Command=>({type,puzzleId:p.state.puzzleId,expectedRevision:p.state.revision,...extra} as Command);
test('versioned backups round trip private discoveries and reject mismatched public pairing',()=>{
  const p=createFixture('broken-conduit','save');p.startingState=structuredClone(p.state);p.startingWithheld=structuredClone(p.withheld);
  p.withheld[0].notes='secret-note';
  const encoded=encodePrivateSave(p),restored=decodePrivateSave(encoded);
  assert.deepEqual(projectPublic(restored),projectPublic(p));assert.equal(restored.withheld[0].notes,'secret-note');
  const publicText=encodePublicSave(p);for(const secret of ['secret-note',p.seed,'solution','withheld','discoveryLabel','history'])assert.ok(!publicText.includes(secret));
  for(const tamper of [(x:any)=>x.version=99,(x:any)=>x.puzzleId='other',(x:any)=>x.publicPuzzle.tiles[0].rotation=2,(x:any)=>x.preparation.state.schemaVersion=99,(x:any)=>x.preparation.solution=[]]){
    const data=JSON.parse(encoded);tamper(data);assert.throws(()=>decodePrivateSave(JSON.stringify(data)),/Invalid/);
  }
  assert.throws(()=>decodePrivateSave('{'));assert.throws(()=>decodePrivateSave(' '.repeat(MAX_SAVE_BYTES+1)));
  assert.throws(()=>decodePrivateSave(publicText));
});
test('undo restores full turn, inventory, provisional placement and discovery state at a fresh revision',()=>{
  let p=createFixture('broken-conduit','undo');p.recoveryMode='tray';p.startingState=structuredClone(p.state);p.startingWithheld=structuredClone(p.withheld);
  const before=structuredClone(p);
  p=applyAdventure(p,command(p,'recover',{pieceId:p.withheld[0].id,destination:'tray'}),gm).preparation;
  const recovered=structuredClone(p),id=p.state.inventory![0].id;
  p=applyAdventure(p,command(p,'place',{pieceId:id,tileIndex:6}),player).preparation;
  const placed=structuredClone(p);
  p=applyAdventure(p,command(p,'rotate',{tileIndex:6}),player).preparation;
  p=applyAdventure(p,command(p,'advance-turn'),player).preparation;
  const revision=p.state.revision;
  p=applyAdventure(p,command(p,'undo'),gm).preparation;
  assert.equal(p.state.revision,revision+1);assert.equal(p.state.activeIndex,0);assert.deepEqual(p.state.turnEdit,placed.state.turnEdit);
  p=applyAdventure(p,command(p,'undo'),gm).preparation;
  assert.deepEqual(p.state.tiles,placed.state.tiles);
  p=applyAdventure(p,command(p,'undo'),gm).preparation;
  assert.deepEqual(p.state.inventory,recovered.state.inventory);assert.equal(p.state.tiles[6],null);
  p=applyAdventure(p,command(p,'undo'),gm).preparation;
  assert.deepEqual(p.withheld,before.withheld);assert.deepEqual(p.state.tiles,before.state.tiles);assert.equal(p.history!.length,0);
  assert.equal(applyAdventure(p,command(p,'undo'),gm).result.accepted,false);
  assert.equal(applyAdventure(p,{...command(p,'rotate',{tileIndex:0}),expectedRevision:0},player).result.accepted,false);
  const originalRoster=structuredClone(p.state.participants);
  p=applyAdventure(p,command(p,'set-mode',{mode:'free'}),gm).preparation;
  p=applyAdventure(p,command(p,'undo'),gm).preparation;assert.equal(p.state.mode,'turns');
  p=applyAdventure(p,command(p,'set-roster',{playerIds:['orin','lyra']}),gm).preparation;
  p=applyAdventure(p,command(p,'undo'),gm).preparation;assert.deepEqual(p.state.participants,originalRoster);
});
test('pause blocks all gameplay; resume, undo, bounded history and failed persistence remain safe',()=>{
  let p=createFixture('relay','pause');p=applyAdventure(p,command(p,'pause-puzzle'),gm).preparation;
  assert.equal(projectPublic(p).paused,true);
  for(const type of ['rotate','recover','set-mode','advance-turn'] as const)assert.equal(applyAdventure(p,command(p,type,{tileIndex:6,mode:'free',pieceId:'absent'}),player).result.accepted,false);
  assert.equal(applyAdventure(p,command(p,'resume-puzzle'),player).result.accepted,false);
  p=applyAdventure(p,command(p,'resume-puzzle'),gm).preparation;
  p.state.mode='free';for(let i=0;i<40;i++)p=applyAdventure(p,command(p,'gm-rotate',{tileIndex:0}),gm).preparation;
  assert.equal(p.history!.length,12);assert.equal(p.actionHistory!.length,32);
  const c=new LocalController(()=>{throw new Error('disk full');},p),before=c.snapshot();
  assert.throws(()=>c.submit({...command(p,'undo')},gm),/disk full/);assert.deepEqual(c.snapshot(),before);
  assert.equal(JSON.stringify(projectPublic(p)).includes('history'),false);
});
test('dais saves, local resume and explicit restore preserve geometry and undo baselines',()=>{
  const p=generateCube({size:4,faces:['top','front','right','back','left'],dimensions:{width:4,depth:4,height:1},powers:1,targets:2,seed:'resume'},'dais');
  const c=new LocalController(()=>{},p);const before=c.snapshot();
  c.submit(command(p,'gm-rotate',{tileIndex:0}),gm);
  const save=decodePrivateSave(encodePrivateSave(c.privatePreparation()));const resumed=new LocalController(()=>{},save);
  assert.deepEqual(resumed.snapshot(),c.snapshot());
  const imported=resumed.restore(save);assert.notEqual(imported.puzzleId,before.puzzleId);assert.deepEqual(imported.cubeDimensions,before.cubeDimensions);
  const undone=resumed.submit({...command(resumed.privatePreparation(),'undo')},gm);assert.equal(undone.accepted,true);
  assert.deepEqual(undone.snapshot.tiles,before.tiles);assert.doesNotThrow(()=>encodePrivateSave(resumed.privatePreparation()));
});

test('shared undo fences processed requests; private loss blocks mutation and a validated restore recovers atomically',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map<string,string>();let failSave=false;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{if(failSave)throw Error('quota');values.set(key,value);}}});
  try{
    let metadata:Record<string,unknown>={other:'kept'},failWrite=false;
    const controller=new SharedController('g',{peers:async()=>[{id:'gm',name:'GM',role:'GM',connectionId:'g'},{id:'lyra',name:'Lyra',role:'PLAYER',connectionId:'p'}],read:async()=>structuredClone(metadata),write:async update=>{metadata={...metadata,...structuredClone(update)};if(failWrite)throw Error('uncertain write');}},undefined,'m4');
    const draft=createFixture('relay','draft');savePrivate('m4:draft:draft',draft);
    await controller.submit({id:'publish',generation:'start',expiresAt:Date.now()+6000,command:{type:'publish-draft',draftId:'draft',puzzleId:'start',expectedRevision:0}},'g');
    const shared=()=>metadata[KEY] as Shared;
    const request=(type:Command['type'],extra:object={}):Request=>({id:crypto.randomUUID(),generation:shared().generation,expiresAt:Date.now()+6000,command:command({state:shared().puzzle},type,extra)});
    const move=request('rotate',{tileIndex:6});await controller.submit(move,'p');const oldGeneration=shared().generation;
    await controller.submit(request('undo'),'g');assert.equal(shared().puzzle.revision,2);assert.notEqual(shared().generation,oldGeneration);
    const before=structuredClone(metadata);await controller.submit(move,'p');assert.deepEqual(metadata,before);
    const privateSave=encodePrivateSave(readPrivate('m4:room')!);
    values.clear();await assert.rejects(controller.submit(request('rotate',{tileIndex:6}),'p'),/Private puzzle unavailable/);assert.deepEqual(metadata,before);
    const restored=rekeyPreparation(decodePrivateSave(privateSave),'restore');savePrivate('m4:draft:restore',restored);
    const restore=request('restore-draft',{draftId:'restore'});
    await controller.submit(restore,'p');assert.deepEqual(metadata,before);
    failSave=true;await assert.rejects(controller.submit(restore,'g'),/Private save unavailable/);assert.deepEqual(metadata,before);failSave=false;
    await controller.submit(restore,'g');assert.equal(shared().puzzle.puzzleId,'restore');assert.equal(metadata.other,'kept');
    for(const secret of ['history','solution','seed','withheld','actionHistory'])assert.ok(!JSON.stringify(shared()).includes(secret));
    await controller.submit(request('pause-puzzle'),'g');const paused=shared().puzzle.revision;
    await controller.submit(request('rotate',{tileIndex:6}),'p');assert.equal(shared().puzzle.revision,paused);
    const checkpoint=encodePrivateSave(readPrivate('m4:room')!);
    failWrite=true;await assert.rejects(controller.submit(request('resume-puzzle'),'g'),/uncertain write/);assert.equal(controller.uncertain,true);failWrite=false;
    savePrivate('m4:draft:reconcile',rekeyPreparation(decodePrivateSave(checkpoint),'reconcile'));
    await controller.submit(request('restore-draft',{draftId:'reconcile'}),'g');assert.equal(controller.uncertain,false);assert.equal(shared().puzzle.puzzleId,'reconcile');assert.equal(shared().puzzle.paused,true);
  }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});
