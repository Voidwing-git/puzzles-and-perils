import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAdvancedChallenge,defaultRules,circuitsMatch,reflectAxis,applyAdvanced,receiverAligned,type ChallengeRules} from '../src/core/challenge-rules.ts';
import {projectPublic} from '../src/core/projection.ts';
import {applyAdventure} from '../src/core/adventure.ts';
import {encodePrivateSave,decodePrivateSave,validatePreparation} from '../src/core/save-format.ts';
import {assertFits,parseRequest} from '../src/transport/protocol.ts';
import type {PrivatePreparation,Actor,Command} from '../src/core/state.ts';
import type {ChallengeAction,ChallengeKind} from '../src/core/challenges.ts';
const gm:Actor={id:'gm',role:'GM'},player:Actor={id:'room-player',role:'PLAYER'};
function act(p:PrivatePreparation,action:ChallengeAction,actor=player,now=Date.now()){const result=applyAdvanced(p,{type:'challenge-action',action,puzzleId:p.state.puzzleId,expectedRevision:p.state.revision},actor,now)!;assert.ok(result.result.accepted,JSON.stringify(result.result));return result.preparation;}
function settings(kind:ChallengeKind,overrides:Partial<ChallengeRules>={}){return{...defaultRules(kind),...overrides};}
test('all advanced kinds and difficulty presets roundtrip privately and fit shared metadata',()=>{
  for(const kind of ['waveform','hex','rotor','glyph','mirror','orbit','sequence','worm'] as const)for(const level of ['easy','standard','hard'] as const){
    const p=createAdvancedChallenge(kind,'new-'+kind,kind==='waveform'?5:1,defaultRules(kind,level));assert.deepEqual(validatePreparation(p),p);assert.deepEqual(decodePrivateSave(encodePrivateSave(p)),p);
    const pub=projectPublic(p);assert.ok(!JSON.stringify(pub).includes('answers'));assertFits({}, {version:1,owner:'gm',generation:'g',puzzle:pub,receipts:[]});
  }
});
test('receiver stack requires every signal to match in one lock and adds phase/harmonic challenge',()=>{
  let p=createAdvancedChallenge('waveform','rack',5,defaultRules('waveform','hard'));
  for(let i=0;i<16;i++)p=act(p,{op:'set',index:i,value:p.state.challenge!.target[i]});p=act(p,{op:'check'});assert.equal(p.state.challenge!.opened,false);assert.equal(p.state.challenge!.stage,0);
  for(let i=16;i<20;i++)p=act(p,{op:'set',index:i,value:p.state.challenge!.target[i]});assert.ok(Array.from({length:5},(_,i)=>receiverAligned(p.state.challenge!,i)).every(Boolean));p=act(p,{op:'check'});assert.equal(p.state.challenge!.opened,true);assert.equal(p.state.challenge!.stage,5);
});
test('hex generator varies connected masks and slot counts, with no forced all-way center',()=>{
  const patterns=new Set<string>();let variedCenter=false;
  for(const count of [3,4,7,12,19])for(let i=0;i<16;i++){
    const p=createAdvancedChallenge('hex','hex',1,settings('hex',{count,links:i%2?75:0})),c=p.state.challenge!,a=p.challengeSecret!.answers[0];assert.equal(c.pieces.length,count);assert.ok(circuitsMatch({...c,values:a}));patterns.add(JSON.stringify(c.pieces));if(c.pieces[0][2]!==63)variedCenter=true;
    assert.ok(!circuitsMatch(c),'starts unsolved');
  }assert.ok(patterns.size>60);assert.ok(variedCenter);
});
test('configurable timers expire authoritatively and enforce GM versus reopen retry',()=>{
  for(const policy of ['gm','reopen'] as const){let p=createAdvancedChallenge('hex','timer',1,settings('hex',{timerSeconds:10,retry:policy}));p=act(p,{op:'enter'},player,1000);assert.equal(p.state.challenge!.clock!.deadline,11000);
    p=act(p,{op:'enter'},player,3000);assert.equal(p.state.challenge!.clock!.deadline,11000,'opening another window cannot reset an active timer');
    p=act(p,{op:'choose',index:0,value:1},player,11001);assert.equal(p.state.challenge!.failed,true);assert.equal(p.state.challenge!.moves,0,'expired command cannot rotate');
    const attempt=p.state.challenge!.attempt;p=act(p,{op:'enter'},player,12000);assert.equal(p.state.challenge!.failed,policy==='gm');assert.equal(p.state.challenge!.attempt,policy==='reopen'?attempt!+1:attempt);
    assert.equal(applyAdvanced(p,{type:'challenge-action',action:{op:'retry'},puzzleId:'timer',expectedRevision:p.state.revision},player,12000)!.result.accepted,false);p=act(p,{op:'retry'},gm,13000);assert.equal(p.state.challenge!.failed,false);assert.equal(p.state.challenge!.clock!.deadline,23000);
  }
});
test('pause/resume freezes the timer, and stale or wrong-turn commands are rejected',()=>{
  let p=createAdvancedChallenge('rotor','pause',1,settings('rotor',{timerSeconds:30}));p=act(p,{op:'enter'});const command=(type:Command['type'])=>({type,puzzleId:'pause',expectedRevision:p.state.revision}) as Command;
  p=applyAdventure(p,command('pause-puzzle'),gm).preparation;assert.ok(p.state.challenge!.clock!.pausedAt);const pausedAt=p.state.challenge!.clock!.pausedAt;p.state.challenge!.clock!.pausedAt-=1000;p=applyAdventure(p,command('resume-puzzle'),gm).preparation;assert.equal(p.state.challenge!.clock!.pausedAt,0);assert.ok(p.state.challenge!.clock!.deadline>=pausedAt+30000);
  p.state.mode='turns';assert.equal(applyAdventure(p,{type:'challenge-action',action:{op:'hit',phase:0},puzzleId:'pause',expectedRevision:p.state.revision},player).result.accepted,false);
});
test('timing pins honor pin count and hit window; randomized pin angles remain solvable',()=>{
  let p=createAdvancedChallenge('rotor','pins',1,settings('rotor',{count:13,window:5,speed:170,reverse:false}));const angles=p.state.challenge!.target;assert.equal(angles.length,13);p=act(p,{op:'hit',phase:(angles[0]+7)%360});assert.equal(p.state.challenge!.mistakes,1);
  for(const a of angles)p=act(p,{op:'hit',phase:a});assert.equal(p.state.challenge!.opened,true);
});
test('glyph clues are overlapping unordered pairs for a longer deduced code',()=>{
  let p=createAdvancedChallenge('glyph','code',1,settings('glyph',{count:6}));const c=p.state.challenge!,a=p.challengeSecret!.answers[0];assert.equal(c.pieces.length,5);assert.equal(c.target.length,0);assert.equal(c.values.length,6);assert.ok(!JSON.stringify(projectPublic(p)).includes(JSON.stringify(a)));
  p=act(p,{op:'check'});assert.equal(p.state.challenge!.opened,false);for(let i=0;i<a.length;i++)while(p.state.challenge!.values[i]!==a[i])p=act(p,{op:'choose',index:i,value:1});p=act(p,{op:'check'});assert.equal(p.state.challenge!.opened,true);
});
test('mirror reflection fixes every point on its axis and preserves perpendicular distance',()=>{
  for(const angle of [0,27,45,90,135,179]){
    const t=angle*Math.PI/180,on=[50+20*Math.cos(t),50+20*Math.sin(t)],r=reflectAxis(angle,on[0],on[1]);assert.ok(Math.hypot(r[0]-on[0],r[1]-on[1])<1e-9);
    const p=[23,71],q=reflectAxis(angle,...p as [number,number]),back=reflectAxis(angle,...q);assert.ok(Math.hypot(back[0]-p[0],back[1]-p[1])<1e-9);
  }
  let p=createAdvancedChallenge('mirror','mirror',1,settings('mirror',{axis:37,count:10,window:12}));const c=p.state.challenge!,angle=c.target[0],signs=c.pieces.map(([x,y])=>Math.sign((x-50)*-Math.sin(angle*Math.PI/180)+(y-50)*Math.cos(angle*Math.PI/180)));assert.ok(signs.includes(1)&&signs.includes(-1));
  const another=createAdvancedChallenge('mirror','another',1,settings('mirror',{axis:37,count:10}));assert.notDeepEqual(c.pieces,another.state.challenge!.pieces);
  for(const [x,y]of c.pieces){const [rx,ry]=reflectAxis(angle,x,y);p=act(p,{op:'hit',index:Math.round(rx),value:Math.round(ry)});}assert.equal(p.state.challenge!.opened,true);
});
test('orbit randomizes dots/arcs, supports track settings and validates tap versus held arc',()=>{
  let p=createAdvancedChallenge('orbit','orbit',1,settings('orbit',{count:4,speed:60,window:12,mistakeLimit:0}));const c=p.state.challenge!,other=createAdvancedChallenge('orbit','other',1,c.rules);assert.notDeepEqual(c.pieces,other.state.challenge!.pieces);
  for(const [ring,angle,tail]of c.pieces)p=act(p,{op:'hit',index:ring,phase:(360-angle)%360,hold:tail?Math.round(tail/60*1000):80});assert.equal(p.state.challenge!.opened,true);
});
test('symbol stream transfers quantities continuously, penalizes excess and wrong symbols',()=>{
  let p=createAdvancedChallenge('sequence','stream');const c=p.state.challenge!,symbol=c.target[0],count=c.target[1];p=act(p,{op:'capture',index:symbol,value:count>4?4:count});if(count>4)p=act(p,{op:'capture',index:symbol,value:count-4});p=act(p,{op:'capture',index:symbol,value:1});assert.ok(p.state.challenge!.mistakes>0);assert.equal(p.state.challenge!.values[0],count);
  for(let i=1;i<c.values.length;i++)for(let j=0;j<c.target[i*2+1];j++)p=act(p,{op:'capture',index:c.target[i*2],value:1});assert.equal(p.state.challenge!.opened,true);
});
test('snake has bounded walls, lives, growing body and preserves collected dots across collisions',()=>{
  let p=createAdvancedChallenge('worm','snake',1,settings('worm',{lives:3,walls:0,count:5}));p.state.challenge!.target=[27,28,29,30,31];p.startingState!.challenge!.target=[27,28,29,30,31];p=act(p,{op:'move',index:1});assert.equal(p.state.challenge!.used.length,1);assert.equal(p.state.challenge!.values.length,4);
  // Drive to the right boundary, then collide. Collected dots survive the life loss.
  for(let i=0;i<9;i++){if(p.state.challenge!.opened)break;p=act(p,{op:'move',index:0});if(p.state.challenge!.livesLeft!<3)break;}
  assert.equal(p.state.challenge!.livesLeft,2);assert.deepEqual(p.state.challenge!.used,[27]);assert.deepEqual(p.state.challenge!.values,[26,25,24]);
  const reverse=applyAdvanced(p,{type:'challenge-action',action:{op:'move',index:3},puzzleId:'snake',expectedRevision:p.state.revision},player)!;assert.equal(reverse.result.accepted,false);
});
test('bounded protocol and saved rules reject corrupt configuration without exposing private answers',()=>{
  const p=createAdvancedChallenge('hex','validate');for(const rules of [{...p.state.challenge!.rules,speed:Infinity},{...p.state.challenge!.rules,timerSeconds:-1},{...p.state.challenge!.rules,retry:'anything'}])assert.throws(()=>validatePreparation({...p,state:{...p.state,challenge:{...p.state.challenge,rules}}}));
  const request={id:'x',generation:'g',expiresAt:1000,command:{type:'challenge-action',action:{op:'capture',index:4,value:1},puzzleId:'validate',expectedRevision:0}};assert.ok(parseRequest(request));assert.equal(parseRequest({...request,command:{...request.command,action:{op:'capture',value:Infinity}}}),null);
});
test('Undo retains a running time budget and a GM interaction can start an unopened timer',()=>{
  let p=createAdvancedChallenge('hex','undo-clock',1,settings('hex',{timerSeconds:60}));p=act(p,{op:'choose',index:0,value:1},gm,1000);assert.equal(p.state.challenge!.clock!.deadline,61000);
  // Use the outer adventure route so the actual private checkpoint is recorded.
  p=createAdvancedChallenge('hex','undo-clock',1,settings('hex',{timerSeconds:60}));p=applyAdventure(p,{type:'challenge-action',action:{op:'enter'},puzzleId:'undo-clock',expectedRevision:0},player).preparation;const deadline=p.state.challenge!.clock!.deadline;
  p=applyAdventure(p,{type:'challenge-action',action:{op:'choose',index:0,value:1},puzzleId:'undo-clock',expectedRevision:p.state.revision},player).preparation;
  p=applyAdventure(p,{type:'undo',puzzleId:'undo-clock',expectedRevision:p.state.revision},gm).preparation;assert.equal(p.state.challenge!.clock!.deadline,deadline);assert.equal(p.state.challenge!.moves,0);
});
test('corruption wins over excess input on the final stream symbol and hidden tuner corruption is rejected',()=>{
  let p=createAdvancedChallenge('sequence','over-input',1,defaultRules('sequence','hard'));const c=p.state.challenge!;c.values=c.values.map((_,i)=>c.target[i*2+1]);const last=c.values.length-1;c.values[last]--;c.mistakes=95;
  p=act(p,{op:'capture',index:c.target[last*2],value:2});assert.equal(p.state.challenge!.failed,true);assert.equal(p.state.challenge!.opened,false);
  const wave=createAdvancedChallenge('waveform','hidden',1,defaultRules('waveform','easy'));wave.state.challenge!.values[2]=50;assert.throws(()=>validatePreparation(wave));
  const hex=createAdvancedChallenge('hex','outside');hex.state.challenge!.pieces[0][0]=2;hex.state.challenge!.pieces[0][1]=2;assert.throws(()=>validatePreparation(hex));
});
