import type {Actor,Command,PrivatePreparation} from './state.ts';
import type {CommandResult,Rejection} from './commands.ts';

export const challengeCatalog={
  terminal:{name:'Word terminal',hint:'Find the password using positional likeness. Bracket pairs remove duds or replenish attempts.',source:'Fallout-style word deduction'},
  spectrum:{name:'Spectral analysis',hint:'Combine three fragments to reproduce the target. Dashed lines subtract absorption.',source:'Spectrograph · 1–6 samples'},
  waveform:{name:'Wave harmonics',hint:'Turn the wavelength and amplitude dials until the two traces match, then lock the signal.',source:'1–5 signals'},
  hex:{name:'Hex circuits',hint:'Rotate the hexagons until every channel joins its neighbor. Right click turns backward.',source:'Corpus-style circuit hacking'},
  rotor:{name:'Timing pins',hint:'Click or press Space as the sweep reaches a pin. Hitting a set pin releases it. The sweep reverses after each hit.',source:'Grineer-style timing'},
  glyph:{name:'Glyph cipher',hint:'Use the clue pairs to align both halves of each cipher. Rotate either symbol, then verify the pair.',source:'Orokin-style symbol pairs'},
  mirror:{name:'Mirror console',hint:'Move to aim the reflected cursor. Click when its gold outline reaches an illuminated node.',source:'Narmer-style mirrored input'},
  orbit:{name:'Orbit lock',hint:'Choose a ring. Catch its dots at the top gate; hold through the long arc. Adjust speed with A and D.',source:'Duviri-style orbit timing'},
  sequence:{name:'Symbol stream',hint:'Hold Space or Capture while the required symbol passes through the gate. Release before the next symbol.',source:'Entrati / Pom-2-style stream'},
  worm:{name:'Data worm',hint:'Steer with arrows, WASD, or the direction pad. Gather every rune and avoid walls. Hold Space to boost.',source:'1999-style collection hack'},
} as const;
export type ChallengeKind=keyof typeof challengeCatalog;
export interface ChallengeState {
  kind:ChallengeKind;total:number;stage:number;opened:boolean;failed:boolean;
  values:number[];target:number[];pieces:number[][];words:string[];
  used:number[];feedback:string;mistakes:number;moves:number;
}
export interface ChallengeAction {op:'choose'|'set'|'check'|'hit'|'move'|'bracket'|'retry';index?:number;value?:number;phase?:number;hold?:number}
const int=(n:unknown,a:number,b:number)=>Number.isInteger(n)&&Number(n)>=a&&Number(n)<=b;
export function validChallengeAction(a:unknown):a is ChallengeAction{
  if(!a||typeof a!=='object')return false;const v=a as ChallengeAction;
  return ['choose','set','check','hit','move','bracket','retry'].includes(v.op)&&
    (v.index===undefined||int(v.index,0,143))&&(v.value===undefined||int(v.value,-1,150))&&
    (v.phase===undefined||int(v.phase,0,359))&&(v.hold===undefined||int(v.hold,0,3000));
}
export const rand=(n:number)=>crypto.getRandomValues(new Uint32Array(1))[0]%n;
const shuffle=<T>(v:T[])=>{for(let i=v.length-1;i>0;i--){const j=rand(i+1);[v[i],v[j]]=[v[j],v[i]];}return v;};
export const glyphs=['◇','⌁','△','✧','⊙','⋈','ϟ','◈'];
const WORDS=['STONE','STORE','SHORE','SHONE','SHARE','SCARE','SCORE','SPORE','SPARE','STALE','STARE','START','SMART','SNARE','SNORE','SMOKE','SPOKE','SPIKE','SLATE','PLATE','PLACE','PLANE','PLANT','GRANT','GRAVE','GRACE','BRACE','TRACE','TRACK','CRACK','CRANE','CRATE'];
export function makeStage(kind:ChallengeKind,stage=0):{data:Pick<ChallengeState,'values'|'target'|'pieces'|'words'>;answer:number[]}{
  let values:number[]=[],target:number[]=[],pieces:number[][]=[],words:string[]=[],answer:number[]=[];
  if(kind==='terminal'){words=shuffle([...WORDS]).slice(0,12);answer=[rand(words.length)];values=[4];}
  if(kind==='waveform'){target=[20+rand(61),20+rand(61)];values=[50,50];if(target.every((n,i)=>Math.abs(n-values[i])<3))target[0]=20;answer=[...target];}
  if(kind==='spectrum'){
    target=Array.from({length:8},()=>rand(3));if(!target.some(n=>n!==0))target[0]=1;
    const a=target.map(n=>rand(n+1)),b=target.map((n,i)=>n-a[i]+(i%3===stage%3?1:0)),c=target.map((_,i)=>i%3===stage%3?-1:0);
    const tagged=shuffle([a,b,c,...Array.from({length:3},()=>Array.from({length:8},()=>rand(4)-1))].map((v,i)=>({v,i})));
    pieces=tagged.map(t=>t.v);answer=tagged.flatMap((t,i)=>t.i<3?[i]:[]);values=[];
  }
  if(kind==='hex'){
    // Center and six neighbors. The outer ring has a radial spoke and two perimeter links.
    pieces=[[0,1,2,3,4,5],...Array.from({length:6},(_,i)=>[(i+3)%6,(i+2)%6,(i+4)%6])];
    values=[0,...Array.from({length:6},()=>1+rand(5))];answer=Array(7).fill(0);
  }
  if(kind==='rotor'){values=Array(8).fill(0);target=[rand(360)];}
  if(kind==='glyph'){pieces=Array.from({length:3},()=>[rand(8),rand(8)]);target=pieces.flat();values=[0,0];answer=[...target];}
  if(kind==='mirror'){pieces=Array.from({length:6},(_,i)=>[20+(i%3)*30,20+Math.floor(i/3)*50]);target=[rand(3)];}
  if(kind==='orbit'){pieces=Array.from({length:9},(_,i)=>[Math.floor(i/3),(i%3)*120, i%3===2?45:0]);target=[rand(360)];}
  if(kind==='sequence'){target=Array.from({length:6},()=>rand(6));pieces=[shuffle([0,1,2,3,4,5])];values=[0];}
  if(kind==='worm'){
    values=[14,13,12];target=shuffle([22,28,43,58,73,91,104,118,130]).slice(0,5);
    pieces=[[38,39,40,74,75,76,109,110]];
  }
  return{data:{values,target,pieces,words},answer};
}
export function createChallenge(kind:ChallengeKind,puzzleId:string,total=1):PrivatePreparation{
  if(!Object.hasOwn(challengeCatalog,kind)||!int(total,1,kind==='spectrum'?6:kind==='waveform'?5:1))throw new Error('Invalid challenge settings.');
  const first=makeStage(kind);
  const challenge:ChallengeState={kind,total,stage:0,opened:false,failed:false,...first.data,used:[],feedback:'',mistakes:0,moves:0};
  const state:PrivatePreparation['state']={schemaVersion:2,puzzleId,title:challengeCatalog[kind].name,puzzleType:'challenge',challenge,width:0,height:0,tiles:[],participants:[{id:'lyra',name:'Lyra'},{id:'orin',name:'Orin'}],activeIndex:0,mode:'free',turnEdit:null,revision:0};
  // Future visible samples are generated on advancement; only current secret is needed.
  return{state,seed:'',solution:[],withheld:[],challengeSecret:{answers:[[...first.answer],[...first.answer]]},startingState:structuredClone(state)};
}
export function projectChallenge(c:ChallengeState):ChallengeState{return{kind:c.kind,total:c.total,stage:c.stage,opened:c.opened,failed:c.failed,values:[...c.values],target:[...c.target],pieces:c.pieces.map(v=>[...v]),words:[...c.words],used:[...c.used],feedback:c.feedback,mistakes:c.mistakes,moves:c.moves};}
export function hexAligned(c:ChallengeState){return c.values.every((r,i)=>i===0||r%6===0);}
export function spectrumSum(c:ChallengeState){return c.target.map((_,i)=>c.values.reduce((n,p)=>n+c.pieces[p][i],0));}
export const circularDistance=(a:number,b:number)=>Math.abs(((a-b+540)%360)-180);
export const mirrorPoint=(mode:number,x:number,y:number):[number,number]=>[mode===1?x:100-x,mode===0?y:100-y];
export function applyChallenge(preparation:PrivatePreparation,command:Command,actor:Actor):{result:CommandResult;preparation:PrivatePreparation}|null{
  const state=preparation.state;
  const reject=(reason:Rejection)=>({result:{accepted:false as const,state,reason},preparation});
  if(state.puzzleType!=='challenge')return command.type==='challenge-action'?reject('invalid-challenge-action'):null;
  if(['set-mode','set-roster','sync-players','advance-turn'].includes(command.type))return null;
  if(!['challenge-action','complete-puzzle','reset-puzzle'].includes(command.type))return reject('invalid-challenge-action');
  const current=state.challenge;if(!current||!preparation.challengeSecret)return reject('invalid-challenge-action');
  if(command.type!=='challenge-action'||command.action.op==='retry'){if(actor.role!=='GM')return reject('gm-only');}
  else{
    if(current.opened)return reject('solved');if(current.failed)return reject('challenge-failed');
    if(state.mode==='turns'&&!state.participants.some(p=>p.id===actor.id))return reject('unknown-player');
    if(state.mode==='turns'&&state.participants[state.activeIndex].id!==actor.id)return reject('wrong-turn');
    if(!validChallengeAction(command.action))return reject('invalid-challenge-action');
  }
  const next=structuredClone(preparation);let c=next.state.challenge!;
  if(command.type==='complete-puzzle'){c.opened=true;c.failed=false;c.stage=c.total;}
  else if(command.type==='reset-puzzle'||(command.type==='challenge-action'&&command.action.op==='retry')){
    // Reset the same challenge and retain the private answer; later stages get a fresh sample.
    if(!next.startingState?.challenge)return reject('invalid-challenge-action');
    c=next.state.challenge=structuredClone(next.startingState.challenge);
    next.challengeSecret!.answers[0]=[...next.challengeSecret!.answers[1]];
  }else if(command.type==='challenge-action'){
    const a=command.action;let solved=false,valid=true;
    c.feedback='';c.moves++;
    const answer=next.challengeSecret!.answers[0];
    if(c.kind==='terminal'){
      if(a.op==='choose'&&int(a.index,0,c.words.length-1)&&!c.used.includes(a.index!)){
        const i=a.index!,word=c.words[i],password=c.words[answer[0]];c.used.push(i);
        const likeness=[...word].filter((l,j)=>l===password[j]).length;
        c.pieces.push([i,likeness]);solved=i===answer[0];if(!solved)c.values[0]--;c.feedback=`${word}: likeness ${likeness}/${word.length}`;c.failed=c.values[0]===0&&!solved;
      }else if(a.op==='bracket'&&int(a.index,0,3)&&!c.used.includes(20+a.index!)){
        c.used.push(20+a.index!);if(a.index===3){c.values[0]=4;c.feedback='Attempts replenished.';}else{const dud=c.words.findIndex((_,i)=>i!==answer[0]&&!c.used.includes(i));if(dud>=0)c.used.push(dud);c.feedback='One dud removed.';}
      }else valid=false;
    }else if(c.kind==='waveform'){
      if(a.op==='set'&&int(a.index,0,1)&&int(a.value,10,100))c.values[a.index!]=a.value!;
      else if(a.op==='check'){solved=c.values.every((n,i)=>Math.abs(n-c.target[i])<=2);if(!solved)c.feedback='The traces are still out of alignment.';}else valid=false;
    }else if(c.kind==='spectrum'){
      if(a.op==='choose'&&int(a.index,0,5)){const i=a.index!;if(c.values.includes(i))c.values=c.values.filter(n=>n!==i);else if(c.values.length<3)c.values.push(i);else c.feedback='Remove a fragment before adding another.';}
      else if(a.op==='check'){solved=c.values.length===3&&spectrumSum(c).every((n,i)=>n===c.target[i]);if(!solved)c.feedback='The absorption lines do not match yet.';}else valid=false;
    }else if(c.kind==='hex'){
      if(a.op==='choose'&&int(a.index,0,6)&&(a.value===1||a.value===-1)){c.values[a.index!]=(c.values[a.index!]+a.value!+6)%6;solved=hexAligned(c);}else valid=false;
    }else if(c.kind==='glyph'){
      if(a.op==='choose'&&int(a.index,0,1))c.values[a.index!]=(c.values[a.index!]+1)%8;
      else if(a.op==='check'){const pair=c.used.length;if(c.values.every((n,i)=>n===answer[pair*2+i])){c.used.push(pair);c.values=[0,0];solved=c.used.length===3;}else c.feedback='That pair does not match the next clue.';}else valid=false;
    }else if(c.kind==='mirror'){
      if(a.op==='hit'&&int(a.index,0,100)&&int(a.value,0,100)){
        const [x,y]=mirrorPoint(c.target[0],a.index!,a.value!);
        const hit=c.pieces.findIndex(([px,py],i)=>!c.used.includes(i)&&Math.hypot(px-x,py-y)<=8);
        if(hit>=0)c.used.push(hit);else{c.mistakes++;c.feedback='Missed the reflected node.';}solved=c.used.length===6;
      }else valid=false;
    }else if(c.kind==='rotor'){
      if(a.op==='hit'&&int(a.phase,0,359)){const i=Math.round(a.phase!/45)%8;if(circularDistance(a.phase!,i*45)<=13){if(c.values[i]){c.mistakes++;c.feedback='Pin released.';}c.values[i]=1-c.values[i];}else{c.mistakes++;c.feedback='The sweep missed a pin.';}solved=c.values.every(n=>n===1);}else valid=false;
    }else if(c.kind==='orbit'){
      if(a.op==='hit'&&int(a.index,0,2)&&int(a.phase,0,359)&&int(a.hold,0,3000)&&(a.value===undefined||int(a.value,50,150))){
        const degrees=a.hold!*.055*(a.value??100)/100;
        const hit=c.pieces.findIndex(([ring,angle,tail],i)=>ring===a.index&&!c.used.includes(i)&&circularDistance(a.phase!+angle,0)<=16&&(tail===0||Math.abs(degrees-tail)<=14));
        if(hit>=0)c.used.push(hit);else{c.mistakes++;c.feedback='Catch the dot at the gate; hold the long arc.';}solved=c.used.length===9;
      }else valid=false;
    }else if(c.kind==='sequence'){
      if(a.op==='hit'&&int(a.index,0,6)&&int(a.hold,0,3000)){
        const progress=c.used.length;if(a.index===c.target[progress]&&a.hold!>=100&&a.hold!<=950){c.used.push(progress);solved=c.used.length===c.target.length;}else{c.mistakes++;c.feedback='Corruption detected. Release between symbols.';}
      }else valid=false;
    }else if(c.kind==='worm'){
      if(a.op==='move'&&int(a.index,0,3)){
        const head=c.values[0],dx=[0,1,0,-1][a.index!],dy=[-1,0,1,0][a.index!],x=head%12+dx,y=Math.floor(head/12)+dy,n=y*12+x;
        if(x<0||x>11||y<0||y>11||c.pieces[0].includes(n)||c.values.slice(0,-1).includes(n)){c.failed=true;c.feedback='Connection lost: collision.';}
        else{c.values.unshift(n);if(c.target.includes(n)&&!c.used.includes(n))c.used.push(n);else c.values.pop();solved=c.used.length===c.target.length;}
      }else valid=false;
    }
    if(!valid)return reject('invalid-challenge-action');
    if(['rotor','mirror','orbit','sequence'].includes(c.kind)&&c.mistakes>=5)c.failed=true;
    if(solved){
      c.stage++;c.feedback='';if(c.stage>=c.total){c.opened=true;c.failed=false;}
      else{const generated=makeStage(c.kind,c.stage);Object.assign(c,generated.data,{used:[],mistakes:0});next.challengeSecret!.answers[0]=generated.answer;}
    }
  }
  next.state.revision++;return{result:{accepted:true,state:next.state},preparation:next};
}

// Strict bounded reconstruction for private imports and history; unknown keys are never copied.
export function validateChallenge(value:unknown):ChallengeState{
  const fail=():never=>{throw new Error('Invalid challenge save.');};
  if(!value||typeof value!=='object')return fail();const c=value as ChallengeState;
  const nums=(v:unknown,max:number,min=-1,high=359):number[]=>Array.isArray(v)&&v.length<=max&&v.every(n=>int(n,min,high))?[...v]:fail();
  if(!Object.hasOwn(challengeCatalog,c.kind)||!int(c.total,1,c.kind==='spectrum'?6:c.kind==='waveform'?5:1)||!int(c.stage,0,c.total)||typeof c.opened!=='boolean'||typeof c.failed!=='boolean'||c.opened!==(c.stage===c.total)||c.opened&&c.failed||!int(c.mistakes,0,1000000)||!int(c.moves,0,1000000)||typeof c.feedback!=='string'||c.feedback.length>240)return fail();
  const result:ChallengeState={kind:c.kind,total:c.total,stage:c.stage,opened:c.opened,failed:c.failed,values:nums(c.values,144),target:nums(c.target,16),pieces:Array.isArray(c.pieces)&&c.pieces.length<=12?c.pieces.map(p=>nums(p,20)):fail(),words:Array.isArray(c.words)&&c.words.length<=12&&c.words.every(w=>typeof w==='string'&&/^[A-Z]{5}$/.test(w))?[...c.words]:fail(),used:nums(c.used,32,0),feedback:c.feedback,mistakes:c.mistakes,moves:c.moves};
  const {values:v,target:t,pieces:p,words:w,used:u}=result;
  if(new Set(u).size!==u.length)return fail();
  if(c.kind==='terminal'&&(v.length!==1||!int(v[0],0,4)||w.length!==12||new Set(w).size!==12||u.some(n=>n>11&&(n<20||n>23))||p.some(row=>row.length!==2||!int(row[0],0,11)||!int(row[1],0,5)||!u.includes(row[0]))))return fail();
  if(c.kind==='waveform'&&(v.length!==2||t.length!==2||[...v,...t].some(n=>!int(n,10,100))))return fail();
  if(c.kind==='spectrum'&&(t.length!==8||t.some(n=>!int(n,0,3))||p.length!==6||p.some(row=>row.length!==8||row.some(n=>!int(n,-1,3)))||v.length>3||new Set(v).size!==v.length||v.some(n=>!int(n,0,5))))return fail();
  if(c.kind==='hex'&&(v.length!==7||v.some(n=>!int(n,0,5))||p.length!==7||p.some(row=>!row.length||row.some(n=>!int(n,0,5)))))return fail();
  if(c.kind==='rotor'&&(v.length!==8||v.some(n=>!int(n,0,1))||t.length!==1))return fail();
  if(c.kind==='glyph'&&(v.length!==2||v.some(n=>!int(n,0,7))||t.length!==6||t.some(n=>!int(n,0,7))||p.length!==3||p.some(row=>row.length!==2)||u.some(n=>n>2)))return fail();
  if(c.kind==='mirror'&&(p.length!==6||p.some(row=>row.length!==2||row.some(n=>!int(n,0,100)))||t.length!==1||!int(t[0],0,2)||u.some(n=>n>5)))return fail();
  if(c.kind==='orbit'&&(p.length!==9||p.some(row=>row.length!==3||!int(row[0],0,2)||!int(row[1],0,359)||!int(row[2],0,90))||t.length!==1||u.some(n=>n>8)))return fail();
  if(c.kind==='sequence'&&(t.length!==6||t.some(n=>!int(n,0,5))||p.length!==1||p[0].length!==6||new Set(p[0]).size!==6||p[0].some(n=>!int(n,0,5))||u.some(n=>n>5)))return fail();
  if(c.kind==='worm'&&(!v.length||v.some(n=>!int(n,0,143))||new Set(v).size!==v.length||t.length!==5||p.length!==1||p[0].some(n=>!int(n,0,143))||u.some(n=>!t.includes(n))))return fail();
  return result;
}
export function validateChallengeSecret(c:ChallengeState,value:unknown):{answers:number[][]}{
  const answers=(value as {answers?:unknown})?.answers;
  if(!Array.isArray(answers)||answers.length!==2||answers.some(a=>!Array.isArray(a)||a.length>16||a.some(n=>!int(n,0,100))))throw new Error('Invalid private challenge.');
  const a=answers[0] as number[];
  if(c.kind==='terminal'&&(a.length!==1||a[0]>=12)||c.kind==='spectrum'&&(a.length!==3||new Set(a).size!==3||a.some(n=>n>5)||c.target.some((n,i)=>n!==a.reduce((sum,j)=>sum+c.pieces[j][i],0)))||c.kind==='glyph'&&(a.length!==6||a.some((n,i)=>n!==c.target[i]))||c.kind==='waveform'&&(a.length!==2||a.some((n,i)=>n!==c.target[i])))throw new Error('Invalid private challenge solution.');
  return{answers:[[...a],[...answers[1]]]};
}
