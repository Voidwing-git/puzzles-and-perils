import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createChallenge,challengeCatalog,validateChallenge,validateChallengeSecret,mirrorPoint,type ChallengeKind,type ChallengeAction} from '../src/core/challenges.ts';
import {applyAdventure} from '../src/core/adventure.ts';
import {projectPublic} from '../src/core/projection.ts';
import {encodePrivateSave,decodePrivateSave,validatePreparation} from '../src/core/save-format.ts';
import {assertFits,parseRequest} from '../src/transport/protocol.ts';
import type {PrivatePreparation,Actor,Command} from '../src/core/state.ts';
const player:Actor={id:'new-room-member',role:'PLAYER'},gm:Actor={id:'gm',role:'GM'};
function act(p:PrivatePreparation,action:ChallengeAction,actor=player){const r=applyAdventure(p,{type:'challenge-action',action,puzzleId:p.state.puzzleId,expectedRevision:p.state.revision},actor);assert.ok(r.result.accepted,JSON.stringify(r.result));return r.preparation;}
function admin(p:PrivatePreparation,type:'undo'|'reset-puzzle'|'complete-puzzle'|'pause-puzzle'|'resume-puzzle'){const r=applyAdventure(p,{type,puzzleId:p.state.puzzleId,expectedRevision:p.state.revision},gm);assert.ok(r.result.accepted);return r.preparation;}
function solve(p:PrivatePreparation){const c=p.state.challenge!,answer=p.challengeSecret!.answers[0];
  if(c.kind==='terminal')return act(p,{op:'choose',index:answer[0]});
  if(c.kind==='waveform'){for(let i=0;i<2;i++)p=act(p,{op:'set',index:i,value:c.target[i]});return act(p,{op:'check'});}
  if(c.kind==='spectrum'){for(const i of answer)p=act(p,{op:'choose',index:i});return act(p,{op:'check'});}
  if(c.kind==='hex'){for(let i=1;i<7;i++)while(p.state.challenge!.values[i]!==0)p=act(p,{op:'choose',index:i,value:1});return p;}
  if(c.kind==='glyph'){for(let pair=0;pair<3;pair++){for(let i=0;i<2;i++)for(let n=0;n<answer[pair*2+i];n++)p=act(p,{op:'choose',index:i});p=act(p,{op:'check'});}return p;}
  if(c.kind==='rotor'){for(let i=0;i<8;i++)p=act(p,{op:'hit',phase:i*45});return p;}
  if(c.kind==='mirror'){for(const [x,y]of c.pieces){const [px,py]=mirrorPoint(c.target[0],x,y);p=act(p,{op:'hit',index:px,value:py});}return p;}
  if(c.kind==='orbit'){for(const [r,a,tail]of c.pieces)p=act(p,{op:'hit',index:r,phase:(360-a)%360,hold:tail?800:0});return p;}
  if(c.kind==='sequence'){for(const s of c.target)p=act(p,{op:'hit',index:s,hold:300});return p;}
  // Route the worm through actual collision rules, using BFS around its current body.
  while(!p.state.challenge!.opened){const s=p.state.challenge!,goal=s.target.find(n=>!s.used.includes(n))!,queue:[number,number[]][]=[[s.values[0],[]]],seen=new Set<number>();let route:number[]|undefined;
    while(queue.length){const [at,steps]=queue.shift()!;if(at===goal){route=steps;break;}if(seen.has(at))continue;seen.add(at);
      for(let d=0;d<4;d++){const x=at%12+[0,1,0,-1][d],y=Math.floor(at/12)+[-1,0,1,0][d],next=y*12+x;if(x>=0&&x<12&&y>=0&&y<12&&!s.pieces[0].includes(next)&&!s.values.includes(next))queue.push([next,[...steps,d]]);}}
    assert.ok(route?.length,'Worm collection remains reachable');for(const d of route!)p=act(p,{op:'move',index:d});
  }return p;
}
for(const kind of Object.keys(challengeCatalog) as ChallengeKind[])test(`${kind}: playable solve, private roundtrip, undo/reset, public size and permission guards`,()=>{
  let p=createChallenge(kind,'test-'+kind);const start=projectPublic(p);p=decodePrivateSave(encodePrivateSave(p));
  assert.equal('challengeSecret'in projectPublic(p),false);assert.equal(JSON.stringify(projectPublic(p)).includes('answers'),false);
  assertFits({}, {version:1,owner:'gm',generation:'test',puzzle:projectPublic(p),receipts:[]});
  p=solve(p);assert.equal(projectPublic(p).solved,true);p=decodePrivateSave(encodePrivateSave(p));
  const prior=admin(p,'undo');assert.equal(prior.state.challenge!.opened,false);p=admin(p,'reset-puzzle');assert.equal(p.state.challenge!.opened,false);assert.deepEqual(p.state.challenge,start.challenge);
  const paused=admin(p,'pause-puzzle');assert.equal(applyAdventure(paused,{type:'challenge-action',action:{op:'check'},puzzleId:p.state.puzzleId,expectedRevision:paused.state.revision},player).result.accepted,false);
  assert.equal(applyAdventure(p,{type:'complete-puzzle',puzzleId:p.state.puzzleId,expectedRevision:p.state.revision},player).result.accepted,false);
  p.state.mode='turns';assert.equal(applyAdventure(p,{type:'challenge-action',action:{op:'check'},puzzleId:p.state.puzzleId,expectedRevision:p.state.revision},player).result.accepted,false);
});
test('spectrum six samples and waveform five signals complete only on the last sample and can reset after advancement',()=>{
  for(const kind of ['spectrum','waveform'] as const){let p=createChallenge(kind,'stages',kind==='spectrum'?6:5);const count=p.state.challenge!.total;
    for(let i=0;i<count;i++){p=solve(p);assert.equal(p.state.challenge!.stage,i+1);assert.equal(p.state.challenge!.opened,i===count-1);p=decodePrivateSave(encodePrivateSave(p));}
    p=admin(p,'reset-puzzle');assert.equal(p.state.challenge!.stage,0);p=decodePrivateSave(encodePrivateSave(p));assert.ok(!solve(p).state.challenge!.opened);
  }
});
test('terminal likeness, bracket tools and GM replacement retain password privately',()=>{
  let p=createChallenge('terminal','terminal'),answer=p.challengeSecret!.answers[0][0];const wrong=p.state.challenge!.words.map((_,i)=>i).filter(i=>i!==answer);
  for(const i of wrong.slice(0,4))p=act(p,{op:'choose',index:i});assert.equal(p.state.challenge!.failed,true);
  assert.equal(applyAdventure(p,{type:'challenge-action',action:{op:'retry'},puzzleId:'terminal',expectedRevision:p.state.revision},player).result.accepted,false);
  p=act(p,{op:'retry'},gm);p=act(p,{op:'bracket',index:0});assert.ok(!p.state.challenge!.used.includes(answer));p=act(p,{op:'choose',index:wrong.find(i=>!p.state.challenge!.used.includes(i))!});p=act(p,{op:'bracket',index:3});assert.equal(p.state.challenge!.values[0],4);assert.equal(solve(p).state.challenge!.opened,true);
});
test('protocol and private imports reject malformed actions, sample counts and data',()=>{
  const request=(action:unknown)=>({id:'a',generation:'g',expiresAt:1,command:{type:'challenge-action',action,puzzleId:'p',expectedRevision:0}});
  for(const action of [{op:'set',value:Infinity},{op:'hit',phase:360},{op:'hit',hold:10000},{op:'move',index:-1},{op:'eval'}])assert.equal(parseRequest(request(action)),null);
  assert.ok(parseRequest(request({op:'hit',index:100,value:100})));
  for(const kind of Object.keys(challengeCatalog) as ChallengeKind[]){const p=createChallenge(kind,'x');assert.throws(()=>validatePreparation({...p,state:{...p.state,challenge:{...p.state.challenge,total:7}}}));assert.throws(()=>validateChallenge({...p.state.challenge,values:[Infinity]}));}
  const p=createChallenge('terminal','x');assert.throws(()=>validateChallengeSecret(p.state.challenge!,{answers:[[99]]}));assert.throws(()=>validatePreparation({...p,state:{...p.state,puzzleType:'pipes'}}));
});
test('a challenge command cannot mutate any other puzzle family and stale duplicate actions cannot advance twice',()=>{
  let p=createChallenge('waveform','x'),command:Command={type:'challenge-action',action:{op:'set',index:0,value:35},puzzleId:'x',expectedRevision:0};p=applyAdventure(p,command,player).preparation;assert.equal(applyAdventure(p,command,player).result.accepted,false);
  const before=JSON.stringify(p);const invalid=applyAdventure(p,{...command,expectedRevision:p.state.revision,action:{op:'choose',index:999}},player);assert.equal(invalid.result.accepted,false);assert.equal(JSON.stringify(p),before);
});
