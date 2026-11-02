import {challengeCatalog,createChallenge,rand,type ChallengeKind,type ChallengeState,type ChallengeAction,circularDistance} from './challenges.ts';
import type {Actor,Command,PrivatePreparation} from './state.ts';
import type {CommandResult,Rejection} from './commands.ts';

export interface ChallengeRules {
  difficulty:'easy'|'standard'|'hard';timerSeconds:number;retry:'gm'|'reopen';
  speed:number;count:number;reverse:boolean;window:number;mistakeLimit:number;
  links:number;phase:boolean;harmonics:boolean;precision:number;
  axis:number;longNotes:boolean;lives:number;walls:number;
}
const integer=(n:unknown,a:number,b:number)=>Number.isInteger(n)&&Number(n)>=a&&Number(n)<=b;
const shuffled=<T>(list:T[])=>{for(let i=list.length-1;i>0;i--){const j=rand(i+1);[list[i],list[j]]=[list[j],list[i]];}return list;};
export function defaultRules(kind:ChallengeKind,difficulty:ChallengeRules['difficulty']='standard'):ChallengeRules{
  const level=['easy','standard','hard'].indexOf(difficulty);
  return{difficulty,timerSeconds:0,retry:'gm',speed:kind==='worm'?[3,5,8][level]:kind==='sequence'?[2,3,5][level]:[55,90,145][level],count:kind==='hex'?[4,7,19][level]:kind==='rotor'?[4,8,12][level]:kind==='glyph'?[3,4,6][level]:kind==='mirror'?[4,7,10][level]:kind==='orbit'?[2,3,5][level]:kind==='sequence'?[3,4,6][level]:kind==='worm'?[5,10,16][level]:1,reverse:level>0,window:[18,12,8][level],mistakeLimit:[10,6,4][level],links:[0,35,70][level],phase:level>0,harmonics:level===2,precision:[3,2,1][level],axis:-1,longNotes:level>0,lives:[5,3,2][level],walls:[0,1,2][level]};
}
export function validateRules(value:unknown):ChallengeRules{
  const r=value as ChallengeRules,fail=():never=>{throw Error('Invalid challenge difficulty settings.');};
  if(!r||!['easy','standard','hard'].includes(r.difficulty)||!['gm','reopen'].includes(r.retry)||!integer(r.timerSeconds,0,1800)||!integer(r.speed,1,300)||!integer(r.count,1,20)||!integer(r.window,3,30)||!integer(r.mistakeLimit,0,30)||!integer(r.links,0,100)||!integer(r.precision,1,5)||!integer(r.axis,-1,179)||!integer(r.lives,1,9)||!integer(r.walls,0,3)||['reverse','phase','harmonics','longNotes'].some(k=>typeof r[k as keyof ChallengeRules]!=='boolean'))return fail();
  return{difficulty:r.difficulty,timerSeconds:r.timerSeconds,retry:r.retry,speed:r.speed,count:r.count,reverse:r.reverse,window:r.window,mistakeLimit:r.mistakeLimit,links:r.links,phase:r.phase,harmonics:r.harmonics,precision:r.precision,axis:r.axis,longNotes:r.longNotes,lives:r.lives,walls:r.walls};
}
const HEX_DIRS=[[0,-1],[1,-1],[1,0],[0,1],[-1,1],[-1,0]];
export const rotateMask=(mask:number,rotation:number)=>((mask<<rotation)|(mask>>(6-rotation)))&63;
export function hexNeighbor(c:ChallengeState,i:number,d:number){const [q,r]=c.pieces[i],delta=HEX_DIRS[d];return c.pieces.findIndex(p=>p[0]===q+delta[0]&&p[1]===r+delta[1]);}
export function circuitsMatch(c:ChallengeState){
  if(!c.pieces.every((p,i)=>{const mask=rotateMask(p[2],c.values[i]);return HEX_DIRS.every((_,d)=>{const j=hexNeighbor(c,i,d),other=j<0?0:rotateMask(c.pieces[j][2],c.values[j]);return !!(mask&(1<<d))===!!(other&(1<<((d+3)%6)));});}))return false;
  const seen=new Set<number>(),queue=[0];while(queue.length){const i=queue.pop()!;if(seen.has(i))continue;seen.add(i);const mask=rotateMask(c.pieces[i][2],c.values[i]);for(let d=0;d<6;d++)if(mask&(1<<d)){const j=hexNeighbor(c,i,d);if(j>=0)queue.push(j);}}return seen.size===c.pieces.length;
}
export function reflectAxis(angle:number,x:number,y:number):[number,number]{const theta=angle*Math.PI/90,dx=x-50,dy=y-50;return[50+Math.cos(theta)*dx+Math.sin(theta)*dy,50+Math.sin(theta)*dx-Math.cos(theta)*dy];}
export const receiverAligned=(c:ChallengeState,n:number)=>c.values.slice(n*4,n*4+4).every((v,i)=>{const diff=i===2?Math.min(Math.abs(v-c.target[n*4+i]),100-Math.abs(v-c.target[n*4+i])):Math.abs(v-c.target[n*4+i]);return diff<=c.rules!.precision;});
export function makeAdvanced(kind:ChallengeKind,rules:ChallengeRules,total:number){
  let values:number[]=[],target:number[]=[],pieces:number[][]=[],answer:number[]=[];
  if(kind==='waveform'){
    target=Array.from({length:total},()=>[25+rand(51),25+rand(51),rules.phase?rand(100):0,rules.harmonics?10+rand(36):0]).flat();
    values=Array.from({length:total},()=>[50,50,0,0]).flat();answer=[...target];
  }else if(kind==='hex'){
    const allCells:number[][]=[[0,0],[0,-1],[1,0],[-1,1],[1,-1],[0,1],[-1,0]],limit=Math.min(19,Math.max(3,rules.count));
    for(let q=-2;q<=2;q++)for(let r=-2;r<=2;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))===2)allCells.push([q,r]);
    const cells=allCells.slice(0,limit);
    const masks=Array(limit).fill(0),add=(i:number,j:number,d:number)=>{masks[i]|=1<<d;masks[j]|=1<<((d+3)%6);};
    for(let i=1;i<limit;i++){const neighbors=HEX_DIRS.flatMap(([dq,dr],d)=>{const j=cells.findIndex((p,j)=>j<i&&p[0]===cells[i][0]+dq&&p[1]===cells[i][1]+dr);return j<0?[]:[{j,d}];});const {j,d}=neighbors[rand(neighbors.length)];add(i,j,d);}
    for(let i=0;i<limit;i++)for(let d=0;d<3;d++){const [dq,dr]=HEX_DIRS[d],j=cells.findIndex(p=>p[0]===cells[i][0]+dq&&p[1]===cells[i][1]+dr);if(j>=0&&rand(100)<rules.links)add(i,j,d);}
    pieces=cells.map(([q,r],i)=>{const rotation=rand(6);answer.push((6-rotation)%6);return[q,r,rotateMask(masks[i],rotation)];});values=answer.map(n=>(n+1+rand(rules.difficulty==='easy'?2:5))%6);
    const sample={pieces,values} as ChallengeState;if(circuitsMatch(sample))values[0]=(values[0]+1)%6;
  }else if(kind==='rotor'){const n=Math.min(16,Math.max(3,rules.count)),offset=rand(360);values=Array(n).fill(0);target=Array.from({length:n},(_,i)=>Math.round((offset+i*360/n)%360));}
  else if(kind==='glyph'){const n=Math.min(7,Math.max(3,rules.count));answer=shuffled([0,1,2,3,4,5,6,7]).slice(0,n);pieces=shuffled(answer.slice(0,-1).map((n,i)=>[n,answer[i+1]]));values=answer.map(n=>(n+1+rand(7))%8);}
  else if(kind==='mirror'){
    const angle=rules.axis<0?rand(180):rules.axis;target=[angle];const normal=[-Math.sin(angle*Math.PI/180),Math.cos(angle*Math.PI/180)];
    for(let i=0;i<Math.min(12,Math.max(3,rules.count));i++){for(let tries=0;tries<1000;tries++){const x=12+rand(77),y=12+rand(77),side=(x-50)*normal[0]+(y-50)*normal[1];if(Math.hypot(x-50,y-50)>41||Math.abs(side)<9||Math.sign(side)!==(i%2?-1:1)||pieces.some(([px,py])=>Math.hypot(px-x,py-y)<14))continue;pieces.push([x,y]);break;}}
  }else if(kind==='orbit'){
    const tracks=Math.min(5,Math.max(2,rules.count)),dots=rules.difficulty==='easy'?2:rules.difficulty==='hard'?5:3;target=[rand(360)];
    pieces=Array.from({length:tracks},(_,ring)=>{const offset=rand(360);return Array.from({length:dots},(_,i)=>[ring,Math.round((offset+i*360/dots+rand(16))%360),rules.longNotes&&rand(3)===0?25+rand(36):0]);}).flat();
    if(rules.longNotes&&!pieces.some(p=>p[2]>0))pieces[pieces.length-1][2]=45;
  }else if(kind==='sequence'){
    const symbols=shuffled([0,1,2,3,4,5,6,7]).slice(0,Math.min(6,Math.max(2,rules.count)));
    target=symbols.flatMap(n=>[n,2+rand(rules.difficulty==='hard'?4:3)]);values=symbols.map(()=>0);
    pieces=[shuffled([...symbols,...symbols,rand(8),rand(8)]).flatMap(n=>Array(2+rand(4)).fill(n))];
  }else if(kind==='worm'){
    values=[26,25,24];pieces=[[]];const blocked=pieces[0],candidates=shuffled(Array.from({length:144},(_,i)=>i).filter(n=>!values.includes(n)&&n!==27));
    function connected(walls:number[]){const seen=new Set<number>(),queue=[26];while(queue.length){const at=queue.pop()!;if(seen.has(at)||walls.includes(at))continue;seen.add(at);for(const d of [-12,1,12,-1]){const n=at+d;if(n<0||n>=144||(Math.abs(d)===1&&Math.floor(n/12)!==Math.floor(at/12)))continue;queue.push(n);}}return seen.size===144-walls.length;}
    for(const n of candidates){if(blocked.length>=rules.walls*7)break;blocked.push(n);if(!connected(blocked))blocked.pop();}
    target=shuffled(Array.from({length:144},(_,i)=>i).filter(n=>!blocked.includes(n)&&!values.includes(n))).slice(0,Math.min(20,Math.max(3,rules.count)));
  }
  return{values,target,pieces,answer};
}
export function createAdvancedChallenge(kind:ChallengeKind,puzzleId:string,total=1,settings=defaultRules(kind)):PrivatePreparation{
  const rules=validateRules(settings);
  if(kind==='terminal'||kind==='spectrum')return Object.assign(createChallenge(kind,puzzleId,total),{});
  if(!integer(total,1,kind==='waveform'?5:1))throw Error('Invalid signal count.');
  const p=createChallenge(kind,puzzleId,kind==='waveform'?1:total),generated=makeAdvanced(kind,rules,total);
  Object.assign(p.state.challenge!,{version:2,rules,clock:{deadline:0,pausedAt:0},attempt:0,livesLeft:rules.lives,total,values:generated.values,target:generated.target,pieces:generated.pieces});
  p.challengeSecret={answers:[[...generated.answer],[...generated.answer]]};p.startingState=structuredClone(p.state);return p;
}
function restart(p:PrivatePreparation,now:number){const old=p.state.challenge!,attempt=old.attempt!+1;p.state.challenge=structuredClone(p.startingState!.challenge!);const c=p.state.challenge!;c.attempt=attempt;c.clock={deadline:c.rules!.timerSeconds?now+c.rules!.timerSeconds*1000:0,pausedAt:0};p.challengeSecret!.answers[0]=[...p.challengeSecret!.answers[1]];}
export function applyAdvanced(preparation:PrivatePreparation,command:Command,actor:Actor,now=Date.now()):{result:CommandResult;preparation:PrivatePreparation}|null{
  const state=preparation.state,current=state.challenge;if(state.puzzleType!=='challenge'||current?.version!==2)return null;
  const reject=(reason:Rejection)=>({result:{accepted:false as const,state,reason},preparation});
  if(['set-mode','set-roster','sync-players','advance-turn'].includes(command.type))return null;
  if(!['challenge-action','complete-puzzle','reset-puzzle'].includes(command.type))return reject('invalid-challenge-action');
  const a:ChallengeAction=command.type==='challenge-action'?command.action:{op:'retry'},rules=current.rules!;
  if(command.type!=='challenge-action'||a.op==='retry'){if(actor.role!=='GM')return reject('gm-only');}
  else{if(current.opened)return reject('solved');if(state.mode==='turns'&&!state.participants.some(p=>p.id===actor.id))return reject('unknown-player');if(state.mode==='turns'&&state.participants[state.activeIndex].id!==actor.id)return reject('wrong-turn');}
  const next=structuredClone(preparation);let c=next.state.challenge!;let solved=false,valid=true;
  if(command.type==='challenge-action'&&!['enter','expire','retry'].includes(a.op)&&!c.clock!.deadline&&rules.timerSeconds)c.clock!.deadline=now+rules.timerSeconds*1000;
  const expired=!!c.clock!.deadline&&now>=c.clock!.deadline;
  if(command.type==='complete-puzzle'){c.opened=true;c.failed=false;c.stage=c.total;}
  else if(command.type==='reset-puzzle'||a.op==='retry')restart(next,now);
  else if(a.op==='enter'){
    if((c.failed||expired)&&rules.retry==='reopen')restart(next,now);
    else if(expired){c.failed=true;c.feedback='Time expired.';}
    else if(!c.clock!.deadline&&rules.timerSeconds)c.clock!.deadline=now+rules.timerSeconds*1000;
    else return{result:{accepted:true,state},preparation};
  }else if(expired){c.failed=true;c.feedback='Time expired.';}
  else if(c.failed)return reject('challenge-failed');
  else if(a.op==='expire')return{result:{accepted:true,state},preparation};
  else{
    c.feedback='';c.moves++;
    if(c.kind==='waveform'){
      if(a.op==='set'&&integer(a.index,0,c.total*4-1)&&integer(a.value,0,100)&&((a.index!%4===2&&rules.phase)||(a.index!%4===3&&rules.harmonics)||a.index!%4<2)&&!(a.index!%4<2&&a.value!<10))c.values[a.index!]=a.value!;
      else if(a.op==='check'){solved=Array.from({length:c.total},(_,i)=>receiverAligned(c,i)).every(Boolean);if(!solved)c.feedback='Align every receiver before locking the rack.';}else valid=false;
    }else if(c.kind==='hex'){
      if(a.op==='choose'&&integer(a.index,0,c.pieces.length-1)&&(a.value===1||a.value===-1)){c.values[a.index!]=(c.values[a.index!]+a.value!+6)%6;solved=circuitsMatch(c);}else valid=false;
    }else if(c.kind==='rotor'){
      if(a.op==='hit'&&integer(a.phase,0,359)){const i=c.target.reduce((best,angle,j)=>circularDistance(angle,a.phase!)<circularDistance(c.target[best],a.phase!)?j:best,0);if(circularDistance(c.target[i],a.phase!)<=rules.window){if(c.values[i])c.mistakes++;c.values[i]=1-c.values[i];}else c.mistakes++;solved=c.values.every(n=>n===1);}else valid=false;
    }else if(c.kind==='glyph'){
      if(a.op==='choose'&&integer(a.index,0,c.values.length-1)&&(a.value===undefined||a.value===1||a.value===-1))c.values[a.index!]=(c.values[a.index!]+(a.value??1)+8)%8;
      else if(a.op==='check'){solved=c.values.every((n,i)=>n===next.challengeSecret!.answers[0][i]);if(!solved)c.feedback='The full code does not follow the clue chain.';}else valid=false;
    }else if(c.kind==='mirror'){
      if(a.op==='hit'&&integer(a.index,0,100)&&integer(a.value,0,100)){const [x,y]=reflectAxis(c.target[0],a.index!,a.value!),hit=c.pieces.findIndex(([px,py],i)=>!c.used.includes(i)&&Math.hypot(x-px,y-py)<=rules.window/3);if(hit<0)c.mistakes++;else c.used.push(hit);solved=c.used.length===c.pieces.length;}else valid=false;
    }else if(c.kind==='orbit'){
      if(a.op==='hit'&&integer(a.index,0,rules.count-1)&&integer(a.phase,0,359)&&integer(a.hold,0,3000)){
        const degrees=a.hold!*rules.speed/1000,hit=c.pieces.findIndex(([r,angle,tail],i)=>r===a.index&&!c.used.includes(i)&&circularDistance(a.phase!+angle,0)<=rules.window&&(tail===0?a.hold!<350:Math.abs(degrees-tail)<=rules.window));
        if(hit<0)c.mistakes++;else c.used.push(hit);solved=c.used.length===c.pieces.length;
      }else valid=false;
    }else if(c.kind==='sequence'){
      if(a.op==='capture'&&integer(a.index,0,7)&&integer(a.value,1,4)){
        const i=c.target.findIndex((n,j)=>j%2===0&&n===a.index)/2;
        for(let n=0;n<a.value!;n++){if(i>=0&&Number.isInteger(i)&&c.values[i]<c.target[i*2+1])c.values[i]++;else c.mistakes+=rules.difficulty==='easy'?3:rules.difficulty==='hard'?10:6;}
        c.mistakes=Math.min(100,c.mistakes);c.failed=c.mistakes>=100;solved=!c.failed&&c.values.every((n,i)=>n===c.target[i*2+1]);
      }else valid=false;
    }else if(c.kind==='worm'){
      if(a.op==='move'&&integer(a.index,0,3)){
        const head=c.values[0],x=head%12+[0,1,0,-1][a.index!],y=Math.floor(head/12)+[-1,0,1,0][a.index!],n=y*12+x,grows=c.target.includes(n)&&!c.used.includes(n);
        if(n===c.values[1])return reject('invalid-challenge-action');
        if(x<0||x>11||y<0||y>11||c.pieces[0].includes(n)||c.values.slice(0,grows?undefined:-1).includes(n)){c.livesLeft!--;c.failed=c.livesLeft===0;c.values=[26,25,24];c.feedback=c.failed?'No lives remaining.':'Collision. Choose a direction to continue.';}
        else{c.values.unshift(n);if(grows)c.used.push(n);else c.values.pop();solved=c.used.length===c.target.length;}
      }else valid=false;
    }else valid=false;
    if(!valid)return reject('invalid-challenge-action');
    if(['rotor','mirror','orbit'].includes(c.kind)&&rules.mistakeLimit>0&&c.mistakes>=rules.mistakeLimit)c.failed=true;
    if(solved){c.opened=true;c.failed=false;c.stage=c.total;c.feedback='';}
  }
  next.state.revision++;return{result:{accepted:true,state:next.state},preparation:next};
}

export function projectAdvanced(c:ChallengeState):ChallengeState{return{version:2,rules:validateRules(c.rules),clock:{deadline:c.clock!.deadline,pausedAt:c.clock!.pausedAt},attempt:c.attempt,livesLeft:c.livesLeft,kind:c.kind,total:c.total,stage:c.stage,opened:c.opened,failed:c.failed,values:[...c.values],target:[...c.target],pieces:c.pieces.map(p=>[...p]),words:[],used:[...c.used],feedback:c.feedback,mistakes:c.mistakes,moves:c.moves};}
export function validateAdvanced(value:unknown):ChallengeState{
  const c=value as ChallengeState,fail=():never=>{throw Error('Invalid advanced puzzle save.');};
  if(!c||c.version!==2||!Object.hasOwn(challengeCatalog,c.kind)||['terminal','spectrum'].includes(c.kind))return fail();
  const rules=validateRules(c.rules),nums=(v:unknown,max:number,min=-8,high=143):number[]=>Array.isArray(v)&&v.length<=max&&v.every(n=>integer(n,min,high))?[...v]:fail();
  if(!integer(c.total,1,c.kind==='waveform'?5:1)||!integer(c.stage,0,c.total)||typeof c.opened!=='boolean'||typeof c.failed!=='boolean'||c.opened!==(c.stage===c.total)||(!c.opened&&c.stage!==0)||c.opened&&c.failed||!integer(c.mistakes,0,1000000)||!integer(c.moves,0,1000000)||!integer(c.attempt,0,1000000)||!integer(c.livesLeft,0,rules.lives)||!c.clock||!Number.isSafeInteger(c.clock.deadline)||c.clock.deadline<0||!Number.isSafeInteger(c.clock.pausedAt)||c.clock.pausedAt<0||typeof c.feedback!=='string'||c.feedback.length>240)return fail();
  const result:ChallengeState={version:2,rules,clock:{deadline:c.clock.deadline,pausedAt:c.clock.pausedAt},attempt:c.attempt,livesLeft:c.livesLeft,kind:c.kind,total:c.total,stage:c.stage,opened:c.opened,failed:c.failed,values:nums(c.values,144,0),target:nums(c.target,40,0,359),pieces:Array.isArray(c.pieces)&&c.pieces.length<=32?c.pieces.map(row=>nums(row,64,-8,359)):fail(),words:[],used:nums(c.used,32,0),feedback:c.feedback,mistakes:c.mistakes,moves:c.moves};
  const {values:v,target:t,pieces:p,used:u}=result;if(new Set(u).size!==u.length)return fail();
  if(c.kind==='waveform'&&(v.length!==c.total*4||t.length!==v.length||[...v,...t].some((n,i)=>!integer(n,i%4<2?10:0,100)||i%4===2&&!rules.phase&&n!==0||i%4===3&&!rules.harmonics&&n!==0)))return fail();
  if(c.kind==='hex'&&(p.length<3||p.length>19||p.length!==rules.count||v.length!==p.length||v.some(n=>n>5)||p.some(row=>row.length!==3||!integer(row[0],-2,2)||!integer(row[1],-2,2)||Math.abs(row[0]+row[1])>2||!integer(row[2],1,63))||new Set(p.map(row=>row.slice(0,2).join(','))).size!==p.length))return fail();
  if(c.kind==='rotor'&&(v.length<3||v.length>16||v.length!==rules.count||v.some(n=>n>1)||t.length!==v.length||new Set(t).size!==t.length))return fail();
  if(c.kind==='glyph'&&(v.length<3||v.length>7||v.length!==rules.count||v.some(n=>n>7)||t.length||p.length!==v.length-1||p.some(row=>row.length!==2||row.some(n=>n<0||n>7))))return fail();
  if(c.kind==='mirror'&&(t.length!==1||t[0]>179||p.length<3||p.length>12||p.length!==rules.count||p.some(row=>row.length!==2||row.some(n=>n<0||n>100))||u.some(n=>n>=p.length)))return fail();
  if(c.kind==='orbit'&&(rules.count<2||rules.count>5||t.length!==1||p.length>30||p.length<rules.count||p.some(row=>row.length!==3||row[0]<0||row[0]>=rules.count||row[1]<0||row[1]>359||row[2]<0||row[2]>60)||u.some(n=>n>=p.length)))return fail();
  if(c.kind==='sequence'&&(t.length<4||t.length>12||v.length!==rules.count||t.length!==v.length*2||new Set(t.filter((_,i)=>i%2===0)).size!==v.length||t.some((n,i)=>!integer(n,i%2?1:0,i%2?5:7))||v.some((n,i)=>n>t[i*2+1])||p.length!==1||p[0].length<8||p[0].some(n=>n<0||n>7)))return fail();
  if(c.kind==='worm'&&(v.length<3||new Set(v).size!==v.length||v.some(n=>n>143)||t.length<3||t.length>20||t.length!==rules.count||new Set(t).size!==t.length||t.some(n=>n>143)||p.length!==1||p[0].some(n=>n<0||n>143)||new Set(p[0]).size!==p[0].length||t.some(n=>p[0].includes(n))||v.some(n=>p[0].includes(n))||u.some(n=>!t.includes(n))||c.livesLeft===0&&!c.failed&&!c.opened))return fail();
  return result;
}
export function validateAdvancedSecret(c:ChallengeState,value:unknown):{answers:number[][]}{
  const a=(value as {answers:number[][]})?.answers;
  if(!Array.isArray(a)||a.length!==2||a.some(row=>!Array.isArray(row)||row.length>40||row.some(n=>!integer(n,0,100))))throw Error('Invalid puzzle solution.');
  if(c.kind==='waveform'&&(a[0].length!==c.target.length||a[0].some((n,i)=>n!==c.target[i])))throw Error('Invalid receiver solution.');
  if(c.kind==='hex'&&(a[0].length!==c.values.length||a[0].some(n=>n>5)||!circuitsMatch({...c,values:a[0]})))throw Error('Invalid circuit solution.');
  if(c.kind==='glyph'&&(a[0].length!==c.values.length||new Set(a[0]).size!==a[0].length||a[0].some(n=>n>7)||c.pieces.some(([x,y])=>!a[0].some((n,i)=>n===x&&a[0][i+1]===y))))throw Error('Invalid clue chain.');
  return{answers:a.map(row=>[...row])};
}
