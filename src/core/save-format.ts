import type {PrivatePreparation,PuzzleState,Tile} from './state.ts';
import {connectedFaces,faceSize} from './cube-topology.ts';
import {traceEnergy} from './connectivity.ts';
import {projectPublic} from './projection.ts';

export const MAX_SAVE_BYTES=4*1024*1024;
function fail():never{throw new Error('Invalid or unsupported puzzle save. The current puzzle was kept.');}
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:fail();
const text=(value:unknown,max=128):string=>typeof value==='string'&&value.length<=max?value:fail();
const integer=(value:unknown,min:number,max:number):number=>Number.isSafeInteger(value)&&Number(value)>=min&&Number(value)<=max?Number(value):fail();
const array=(value:unknown,max=96):unknown[]=>Array.isArray(value)&&value.length<=max?value:fail();
const recoveredId=(value:unknown)=>{const id=text(value,80);if(!/^recovered-[\d-]{1,40}$/.test(id))fail();return id;};
function tile(value:unknown):Tile|null {
  if(value===null)return null;const t=object(value);
  if(!['straight','elbow','tee','endpoint'].includes(String(t.shape)))fail();
  const result:Tile={shape:t.shape as Tile['shape'],rotation:integer(t.rotation,0,3) as Tile['rotation']};
  if(t.terminal!==undefined){if(!['source','target'].includes(String(t.terminal)))fail();result.terminal=t.terminal as Tile['terminal'];}
  if(t.energy!==undefined){if(!['azure','amber','verdant'].includes(String(t.energy)))fail();result.energy=t.energy as Tile['energy'];}
  return result;
}
function state(value:unknown):PuzzleState {
  const s=object(value);if(s.schemaVersion!==2)fail();
  const width=integer(s.width,3,6),height=integer(s.height,1,36);
  const result:PuzzleState={schemaVersion:2,puzzleId:text(s.puzzleId),title:text(s.title),width,height,tiles:array(s.tiles).map(tile),participants:array(s.participants,32).map(value=>{const p=object(value);return{id:text(p.id),name:text(p.name)};}),activeIndex:0,mode:'turns',turnEdit:null,revision:integer(s.revision,0,Number.MAX_SAFE_INTEGER-100)};
  if(!result.puzzleId||!result.participants.length||result.participants.some(p=>!p.id)||new Set(result.participants.map(p=>p.id)).size!==result.participants.length)fail();
  result.activeIndex=integer(s.activeIndex,0,result.participants.length-1);
  if(s.mode!=='turns'&&s.mode!=='free')fail();result.mode=s.mode;
  if(s.paused!==undefined){if(typeof s.paused!=='boolean')fail();result.paused=s.paused;}
  if(s.rosterCustomized!==undefined){if(typeof s.rosterCustomized!=='boolean')fail();result.rosterCustomized=s.rosterCustomized;}
  if(s.cubeFaces!==undefined){
    const faces=array(s.cubeFaces,6).map(v=>text(v,10)) as NonNullable<PuzzleState['cubeFaces']>;
    if(!connectedFaces(faces)||![3,4].includes(width))fail();result.cubeFaces=faces;
    if(s.cubeDimensions!==undefined){const d=object(s.cubeDimensions);if(d.width!==4||d.depth!==4||d.height!==1||width!==4)fail();result.cubeDimensions={width:4,depth:4,height:1};}
    const count=faces.reduce((sum,face)=>{const grid=faceSize(face,width,result.cubeDimensions);return sum+grid.width*grid.height;},0);
    if(result.tiles.length!==count||height!==Math.ceil(count/width))fail();
  }else if(s.cubeDimensions!==undefined||height!==width||result.tiles.length!==width*height)fail();
  const index=(v:unknown)=>integer(v,0,result.tiles.length-1);
  if(s.turnEdit!==null){const edit=object(s.turnEdit);result.turnEdit={tileIndex:index(edit.tileIndex),originalRotation:integer(edit.originalRotation,0,3) as Tile['rotation'],...(edit.placedPiece!==undefined?{placedPiece:text(edit.placedPiece,80)}:{})};if(!result.tiles[result.turnEdit.tileIndex]||result.tiles[result.turnEdit.tileIndex]?.terminal||result.mode==='free')fail();}
  if(s.inventory!==undefined)result.inventory=array(s.inventory).map(value=>{const p=object(value),t=tile(p.tile);if(!t||t.terminal)fail();return{id:recoveredId(p.id),tile:t!};});
  if(s.placements!==undefined)result.placements=array(s.placements).map(value=>{const p=object(value);return{id:recoveredId(p.id),tileIndex:index(p.tileIndex)};});
  if(new Set(result.inventory?.map(p=>p.id)).size!==(result.inventory?.length??0)||new Set(result.placements?.map(p=>p.id)).size!==(result.placements?.length??0)||new Set(result.placements?.map(p=>p.tileIndex)).size!==(result.placements?.length??0))fail();
  if(result.placements?.some(p=>!result.tiles[p.tileIndex]||result.tiles[p.tileIndex]?.terminal||result.inventory?.some(i=>i.id===p.id)))fail();
  if(result.turnEdit?.placedPiece&&!result.placements?.some(p=>p.id===result.turnEdit?.placedPiece&&p.tileIndex===result.turnEdit.tileIndex))fail();
  return result;
}
export function validatePreparation(value:unknown,checkpoint=false):PrivatePreparation {
  const p=object(value),s=state(p.state),solution=array(p.solution).map(tile);
  if(solution.length!==s.tiles.length||!traceEnergy({...s,tiles:solution}).solved)fail();
  if(solution.some((t,i)=>(t?.terminal||s.tiles[i]?.terminal)&&JSON.stringify(t)!==JSON.stringify(s.tiles[i])))fail();
  const origin=(value:unknown)=>{const p=object(value),t=tile(p.tile);if(!t||t.terminal)fail();return{...(p.id!==undefined?{id:text(p.id,80)}:{}),index:integer(p.index,0,s.tiles.length-1),tile:t!,discoveryLabel:text(p.discoveryLabel,120),...(p.notes!==undefined?{notes:text(p.notes,2000)}:{})};};
  const result:PrivatePreparation={state:s,solution,seed:text(p.seed,100),withheld:array(p.withheld).map(origin)};
  if(new Set(result.withheld.map(p=>p.index)).size!==result.withheld.length||result.withheld.some(p=>s.tiles[p.index]))fail();
  if(p.recoveryMode!==undefined){if(p.recoveryMode!=='tray'&&p.recoveryMode!=='socket')fail();result.recoveryMode=p.recoveryMode;}
  if(p.startingState!==undefined){result.startingState=state(p.startingState);if(result.startingState.puzzleId!==s.puzzleId||result.startingState.tiles.length!==s.tiles.length||JSON.stringify(result.startingState.cubeFaces)!==JSON.stringify(s.cubeFaces)||JSON.stringify(result.startingState.cubeDimensions)!==JSON.stringify(s.cubeDimensions))fail();}
  if(p.startingWithheld!==undefined)result.startingWithheld=array(p.startingWithheld).map(origin);
  if(p.hiddenInventory!==undefined)result.hiddenInventory=array(p.hiddenInventory).map(value=>{const p=object(value),t=tile(p.tile);if(!t||t.terminal)fail();return{id:recoveredId(p.id),tile:t!,...(p.origin!==undefined?{origin:origin(p.origin)}:{})};});
  const pieceIds=[...(s.inventory??[]).map(p=>p.id),...(s.placements??[]).map(p=>p.id),...(result.hiddenInventory??[]).map(p=>p.id)];if(new Set(pieceIds).size!==pieceIds.length)fail();
  if(p.trayOrigins!==undefined){result.trayOrigins={};for(const [key,value]of Object.entries(object(p.trayOrigins))){if(!/^[\w-]{1,80}$/.test(key)||['__proto__','constructor','prototype'].includes(key))fail();result.trayOrigins[key]=origin(value);}}
  if(p.recoveryDestinations!==undefined){result.recoveryDestinations={};for(const [key,value]of Object.entries(object(p.recoveryDestinations))){const index=integer(Number(key),0,s.tiles.length-1);if(String(index)!==key||(value!=='tray'&&value!=='socket'))fail();result.recoveryDestinations[index]=value;}}
  if(!checkpoint&&p.history!==undefined){result.history=array(p.history,12).map(value=>{const encoded=text(value,512*1024);const previous=validatePreparation(JSON.parse(encoded),true);if(previous.state.puzzleId!==s.puzzleId||previous.state.tiles.length!==s.tiles.length||JSON.stringify(previous.state.cubeFaces)!==JSON.stringify(s.cubeFaces)||JSON.stringify(previous.state.cubeDimensions)!==JSON.stringify(s.cubeDimensions))fail();return JSON.stringify(previous);});if(new TextEncoder().encode(JSON.stringify(result.history)).length>512*1024)fail();}
  if(!checkpoint&&p.actionHistory!==undefined)result.actionHistory=array(p.actionHistory,32).map(value=>{const a=object(value);return{revision:integer(a.revision,0,Number.MAX_SAFE_INTEGER),action:text(a.action,40),actor:text(a.actor),...(a.name!==undefined?{name:text(a.name,128)}:{}),...(a.at!==undefined?{at:integer(a.at,0,Number.MAX_SAFE_INTEGER)}:{}),...(a.detail!==undefined?{detail:text(a.detail,240)}:{})};});
  return result;
}
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
export function encodePrivateSave(preparation:PrivatePreparation):string {
  const p=validatePreparation(preparation);
  const encoded=JSON.stringify({format:'arcane-pipes-private-save',version:1,puzzleId:p.state.puzzleId,publicPuzzle:projectPublic(p),preparation:p},null,2);
  if(new TextEncoder().encode(encoded).length>MAX_SAVE_BYTES)throw new Error('Private save exceeds the supported size.');return encoded;
}
export function decodePrivateSave(encoded:string):PrivatePreparation {
  if(new TextEncoder().encode(encoded).length>MAX_SAVE_BYTES)fail();
  try{const data=object(JSON.parse(encoded));if(data.format===undefined&&data.version===undefined&&data.state!==undefined)return validatePreparation(data);if(data.format!=='arcane-pipes-private-save'||data.version!==1)fail();const p=validatePreparation(data.preparation);if(data.puzzleId!==p.state.puzzleId||canonical(data.publicPuzzle)!==canonical(projectPublic(p)))fail();return p;}catch{fail();}
}
export function encodePublicSave(preparation:PrivatePreparation):string {return JSON.stringify({format:'arcane-pipes-public-save',version:1,puzzleId:preparation.state.puzzleId,puzzle:projectPublic(preparation)},null,2);}
export function rekeyPreparation(preparation:PrivatePreparation,puzzleId:string):PrivatePreparation{
  const next=structuredClone(preparation);next.state.puzzleId=puzzleId;if(next.startingState)next.startingState.puzzleId=puzzleId;
  next.history=next.history?.map(encoded=>{const p=JSON.parse(encoded) as PrivatePreparation;p.state.puzzleId=puzzleId;if(p.startingState)p.startingState.puzzleId=puzzleId;return JSON.stringify(p);});return next;
}
