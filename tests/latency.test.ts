import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ChangeSignal} from '../src/transport/change-signal.ts';
import {createFixture} from '../src/core/fixtures.ts';
import {readPrivate,readValidatedPrivate,savePrivate,privateStorageKey} from '../src/core/private-store.ts';

test('receipt notification wakes all waiters and cannot be lost during a read',async()=>{
  const changes=new ChangeSignal(),version=changes.version;
  changes.notify();await changes.wait(version,60000);
  const first=changes.wait(changes.version,60000),second=changes.wait(changes.version,60000);
  changes.notify();await Promise.all([first,second]);assert.equal(changes.version,2);
});
test('receipt waits keep a bounded polling fallback when notifications are absent',async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  const changes=new ChangeSignal();let completed=false;
  const waiting=changes.wait(changes.version,200).then(()=>{completed=true;});
  context.mock.timers.tick(199);await Promise.resolve();assert.equal(completed,false);
  context.mock.timers.tick(1);await waiting;assert.equal(completed,true);
  changes.notify();assert.equal(changes.version,1);
});
test('validated private reads are detached and detect same-window tampering, deletion and storage failure',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map<string,string>();let blocked=false;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>{if(blocked)throw Error('blocked');return values.get(key)??null;},setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});
  try{
    const p=createFixture('relay','cache-test');savePrivate('cache-test',p);
    assert.deepEqual(readValidatedPrivate('cache-test'),p);
    const first=readValidatedPrivate('cache-test')!;first.state.tiles[6]!.rotation=2;
    assert.equal(readValidatedPrivate('cache-test')!.state.tiles[6]!.rotation,p.state.tiles[6]!.rotation);
    const changed=readPrivate('cache-test')!;changed.state.title='Changed externally';values.set(privateStorageKey('cache-test'),JSON.stringify(changed));
    assert.equal(readValidatedPrivate('cache-test')!.state.title,'Changed externally');
    values.set(privateStorageKey('cache-test'),'{private-malformed-canary');
    assert.throws(()=>readValidatedPrivate('cache-test'),error=>error instanceof Error&&!error.message.includes('private-malformed-canary'));
    changed.state.schemaVersion=99 as any;values.set(privateStorageKey('cache-test'),JSON.stringify(changed));assert.throws(()=>readValidatedPrivate('cache-test'),/Invalid/);
    savePrivate('cache-test',p);assert.ok(readValidatedPrivate('cache-test'));blocked=true;assert.throws(()=>readValidatedPrivate('cache-test'),/unavailable/);blocked=false;
    values.delete(privateStorageKey('cache-test'));assert.equal(readValidatedPrivate('cache-test'),null);
  }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete(globalThis as any).localStorage;}
});
