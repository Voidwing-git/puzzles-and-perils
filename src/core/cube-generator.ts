import {boardNeighbor,connectedFaces,faceSize,cubeCell} from './cube-topology.ts';
import type {CubeFace,PrismDimensions} from './cube-topology.ts';
import {ports} from './pieces.ts';
import {traceEnergy} from './connectivity.ts';
import type {Direction,Energy,PrivatePreparation,Tile,PuzzleState} from './state.ts';

export function generateCube(settings:{size:number;faces:CubeFace[];powers:number;targets:number;seed:string;dimensions?:PrismDimensions},puzzleId:string):PrivatePreparation {
  const {size,faces,powers,targets,seed}=settings;
  if(![3,4].includes(size)||!connectedFaces(faces)||![1,2,3].includes(powers)||![1,2].includes(targets)||!seed||seed.length>100)throw new Error('Choose connected cube faces, grid size 3 or 4, and 1-3 currents with 1-2 targets.');
  let hash=2166136261;for(const c of seed)hash=Math.imul(hash^c.charCodeAt(0),16777619);
  const random=()=>{hash^=hash<<13;hash^=hash>>>17;hash^=hash<<5;return(hash>>>0)/4294967296;};
  const pick=<T>(items:T[])=>items[Math.floor(random()*items.length)];
  const dimensions=settings.dimensions;
  if(dimensions&&(dimensions.width!==4||dimensions.depth!==4||dimensions.height!==1||size!==4))throw new Error('The dais preset requires 4 x 4 x 1.');
  const count=faces.reduce((sum,face)=>{const grid=faceSize(face,size,dimensions);return sum+grid.width*grid.height;},0);
  const layout={width:size,height:Math.ceil(count/size),cubeFaces:[...faces],...(dimensions?{cubeDimensions:{...dimensions}}:{})};
  if(count<powers*(targets+3))throw new Error('Not enough surface squares for these currents and goals. Enable more faces, choose a larger grid, or use fewer currents.');
  const neighbors=Array.from({length:count},(_,i)=>([0,1,2,3] as Direction[]).flatMap(direction=>{const next=boardNeighbor(layout,i,direction);return next?[{...next,direction}]:[];}));
  const adjacent=(a:number,b:number)=>neighbors[a].some(n=>n.index===b);
  for(let attempt=0;attempt<1024;attempt++){
    const regions:number[][]=Array.from({length:powers},()=>[]),owner=Array<number>(count).fill(-1);
    for(let power=0;power<powers;power++){const seed=pick(owner.flatMap((v,i)=>v===-1?[i]:[]));owner[seed]=power;regions[power].push(seed);}
    for(;;){
      const frontier=regions.flatMap((nodes,power)=>nodes.flatMap(index=>neighbors[index].filter(n=>owner[n.index]===-1).map(n=>({index:n.index,power}))));
      if(!frontier.length)break;
      const next=pick(frontier);owner[next.index]=next.power;regions[next.power].push(next.index);
    }
    const solution:(Tile|null)[]=Array(count).fill(null);
    let valid=true;
    for(let power=0;power<powers;power++){
      const nodes=regions[power],edges=new Map(nodes.map(i=>[i,[] as number[]]));
      if(nodes.length<targets+3){valid=false;break;}
      const visited=new Set<number>(),stack=[pick(nodes)];visited.add(stack[0]);
      while(stack.length){const at=stack.at(-1)!;const options=neighbors[at].filter(n=>owner[n.index]===power&&!visited.has(n.index)&&edges.get(at)!.length<3);if(!options.length){stack.pop();continue;}
        const next=pick(options).index;edges.get(at)!.push(next);edges.get(next)!.push(at);visited.add(next);stack.push(next);}
      if(visited.size!==nodes.length){valid=false;break;}
      const leaves=nodes.filter(i=>edges.get(i)!.length===1);
      const choices=leaves.flatMap((a,i)=>targets===1?[[a]]:leaves.slice(i+1).filter(b=>!adjacent(a,b)).map(b=>[a,b]));
      if(!choices.length){valid=false;break;}
      const goals=pick(choices);
      let sources=nodes.filter(i=>!goals.includes(i)&&goals.every(g=>!adjacent(i,g)));
      // A single-current multi-face puzzle must actually use a seam to a goal.
      if(powers===1&&faces.length>1)sources=sources.filter(i=>goals.some(g=>cubeCell(i,size,faces,dimensions).face!==cubeCell(g,size,faces,dimensions).face));
      if(!sources.length){valid=false;break;}
      const source=pick(sources),energy:Energy=(['azure','amber','verdant'] as const)[power];
      for(const index of nodes){const openings=edges.get(index)!.map(i=>neighbors[index].find(n=>n.index===i)!.direction);
        const shape=openings.length===1?'endpoint':openings.length===3?'tee':(openings[0]+2)%4===openings[1]?'straight':'elbow';
        const rotation=([0,1,2,3] as Direction[]).find(rotation=>openings.every(d=>ports({shape,rotation}).includes(d)))!;
        solution[index]={shape,rotation,...(goals.includes(index)?{terminal:'target',energy}:index===source?{terminal:'source',energy}:{})};
      }
    }
    if(!valid)continue;
    for(let scramble=0;scramble<64;scramble++){
      const state:PuzzleState={...layout,schemaVersion:2,puzzleId,title:dimensions?'Dais conduit':'Cube conduit',tiles:solution.map(tile=>tile!.terminal?{...tile!}:{...tile!,rotation:Math.floor(random()*4) as Direction}),participants:[{id:'lyra',name:'Lyra'},{id:'orin',name:'Orin'}],activeIndex:0,mode:'turns',turnEdit:null,revision:0,inventory:[]};
      if(!traceEnergy(state).solved)return{state,solution,seed,withheld:[],recoveryMode:'tray'};
    }
  }
  throw new Error('No cube layout found. Try a different seed or fewer currents.');
}
