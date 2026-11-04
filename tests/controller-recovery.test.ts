import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SharedController} from '../src/controller/shared-controller.ts';
import {createFixture} from '../src/core/fixtures.ts';
import {savePrivate,readPrivate,privateStorageKey} from '../src/core/private-store.ts';
import {KEY} from '../src/transport/protocol.ts';
import type {Shared,Request} from '../src/transport/protocol.ts';
import {projectPublic} from '../src/core/projection.ts';
import {createLock} from '../src/core/lockpick.ts';
import {createRingDoor} from '../src/core/ring-door.ts';
import {createChallenge} from '../src/core/challenges.ts';

test('lost write acknowledgments reconcile each token without replay, including background restarts',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});
 try{
  for(const tokenId of ['token-a','token-b'])for(const landed of [false,true])for(const restart of [false,true]){
   let metadata:Record<string,unknown>={},fail=false,writes=0;
   const io={peers:async()=>[{id:'gm',connectionId:'g',role:'GM' as const,name:'GM'},{id:'lyra',connectionId:'p',role:'PLAYER' as const,name:'Player'}],read:async()=>structuredClone(metadata),write:async(update:Record<string,unknown>)=>{writes++;if(!fail||landed)metadata={...metadata,...structuredClone(update)};if(fail)throw Error('write acknowledgment lost');}};
   let controller=new SharedController('g',io,tokenId,'recovery');
   const draft=createFixture('relay',crypto.randomUUID());draft.state.mode='free';savePrivate(`recovery:draft:${draft.state.puzzleId}`,draft);
   await controller.submit({id:'publish',tokenId,generation:'start',expiresAt:Date.now()+6000,command:{type:'publish-draft',draftId:draft.state.puzzleId,puzzleId:'start',expectedRevision:0}},'g');
   const shared=()=>metadata[KEY] as Shared;
   const request=(id:string):Request=>({id,tokenId,generation:shared().generation,expiresAt:Date.now()+6000,command:{type:'rotate',tileIndex:6,puzzleId:shared().puzzle.puzzleId,expectedRevision:shared().puzzle.revision}});
   const interrupted=request('interrupted');fail=true;await assert.rejects(controller.submit(interrupted,'p'),/acknowledgment lost/);fail=false;
   assert.equal(controller.uncertain,true);assert.ok(readPrivate(`recovery:${tokenId}:staged`));
   if(restart)controller=new SharedController('g',io,tokenId,'recovery');
   const revision=shared().puzzle.revision;
   if(!landed){
     const count=writes;await assert.rejects(controller.submit(request('unresolved'),'p'),/save outcome is unresolved/);assert.equal(writes,count);
     const replacement=readPrivate(`recovery:${tokenId}`)!;savePrivate(`recovery:draft:${replacement.state.puzzleId}`,replacement);
     await controller.submit({...request('explicit-save'),command:{type:'publish-draft',draftId:replacement.state.puzzleId,puzzleId:shared().puzzle.puzzleId,expectedRevision:shared().puzzle.revision}},'g');
   }
   const next=request('next');await controller.submit(next,'p');
   assert.equal(controller.uncertain,false);assert.equal(shared().puzzle.revision,revision+1);
   assert.equal(readPrivate(`recovery:${tokenId}`)!.state.revision,shared().puzzle.revision);
   assert.equal(values.has(privateStorageKey(`recovery:${tokenId}:staged`)),false);
   const count=writes;await controller.submit(interrupted,'p');assert.equal(writes,count);
   assert.equal(shared().puzzle.revision,revision+1,'old move cannot be applied twice or replayed after another revision');
  }
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});

test('automatic reconnect preserves complete puzzle progress and private baselines across puzzle types',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});
 try{
  for(const [i,draft] of [createFixture('broken-conduit','pipes'),createLock('adept','lock'),createRingDoor('door'),createChallenge('hex','hex')].entries()){
    const tokenId=i?`token-${i}`:undefined,key=`auto:${tokenId??'room'}`;draft.state.revision=7;savePrivate(key,draft);
    const puzzle=projectPublic(draft),original=structuredClone(draft);
    let shared:Shared={version:1,owner:'old-gm',generation:'old-generation',puzzle,receipts:[{id:'old-request',connection:'p',revision:7,accepted:true}],...(tokenId?{tokenId}:{})};let writes=0;
    const controller=new SharedController('new-gm',{peers:async()=>[{id:'gm',connectionId:'new-gm',role:'GM',name:'GM'}],read:async()=>({[KEY]:structuredClone(shared),other:'kept'}),write:async update=>{shared=update[KEY] as Shared;writes++;}},tokenId,'auto');
    assert.equal(await controller.reconnect(),'reconnected');assert.equal(shared.owner,'new-gm');assert.notEqual(shared.generation,'old-generation');assert.deepEqual(shared.receipts,[]);
    assert.deepEqual(shared.puzzle,puzzle);assert.deepEqual(readPrivate(key),original);
    assert.equal(await controller.reconnect(),'current');assert.equal(writes,1);
  }
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});

test('automatic reconnect skips missing, mismatched, duplicated and multiply-owned puzzles without writing',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});
 try{
  for(const failure of ['missing','mismatch','duplicate','multiple-gm','party-changed','metadata-changed','unlanded-stage']){
    const draft=createFixture('relay',failure);if(failure!=='missing')savePrivate('guard:token',draft);
    const shared:Shared={version:1,owner:'old',generation:'old-gen',tokenId:failure==='duplicate'?'original-token':'token',puzzle:projectPublic(draft),receipts:[]};
    if(failure==='mismatch')shared.puzzle.revision++;
    if(failure==='unlanded-stage'){const pending=structuredClone(draft);pending.state.revision++;savePrivate('guard:token:staged',pending);}else values.delete(privateStorageKey('guard:token:staged'));
    let checks=0,reads=0;
    const controller=new SharedController('new',{peers:async()=>{checks++;return [{id:'gm',connectionId:'new',role:'GM',name:'GM'},...((failure==='multiple-gm'||failure==='party-changed'&&checks>1)?[{id:'old',connectionId:'old',role:'GM' as const,name:'Other GM'}]:[])];},read:async()=>{reads++;return {[KEY]:{...shared,...(failure==='metadata-changed'&&reads>1?{generation:'changed'}:{})}};},write:async()=>assert.fail('Unsafe reconnect must not write')},'token','guard');
    assert.equal(await controller.reconnect(),'skipped',failure);
  }
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});

test('reconciliation fails closed when neither private save matches the durable board',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});
 try{
  const draft=createFixture('relay','mismatch');draft.state.mode='free';
  savePrivate('mismatch:room',draft);const staged=structuredClone(draft);staged.state.revision=1;savePrivate('mismatch:room:staged',staged);
  const {projectPublic}=await import('../src/core/projection.ts');const puzzle=projectPublic(draft);puzzle.revision=2;
  const shared:Shared={version:1,owner:'g',generation:'gen',puzzle,receipts:[]};
  const controller=new SharedController('g',{peers:async()=>[{id:'gm',connectionId:'g',role:'GM',name:'GM'}],read:async()=>({[KEY]:shared}),write:async()=>assert.fail('Unmatched private state must never write')},undefined,'mismatch');
  await assert.rejects(controller.submit({id:'move',generation:'gen',expiresAt:Date.now()+6000,command:{type:'rotate',tileIndex:6,puzzleId:'mismatch',expectedRevision:2}},'g'),/does not match/);
  assert.equal(readPrivate('mismatch:room')!.state.revision,0);
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});
