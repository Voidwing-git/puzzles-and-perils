import type {Direction} from './state.ts';

export type CubeFace = 'front' | 'right' | 'back' | 'left' | 'top' | 'bottom';
type Vector = readonly [number, number, number];
// Local right/down axes as seen from outside each face. These also define
// rendering orientation, so topology and artwork share one coordinate frame.
export const cubeFrames: Record<CubeFace, {normal: Vector; right: Vector; down: Vector}> = {
  front: {normal:[0,0,1], right:[1,0,0], down:[0,-1,0]},
  right: {normal:[1,0,0], right:[0,0,-1], down:[0,-1,0]},
  back: {normal:[0,0,-1], right:[-1,0,0], down:[0,-1,0]},
  left: {normal:[-1,0,0], right:[0,0,1], down:[0,-1,0]},
  top: {normal:[0,1,0], right:[1,0,0], down:[0,0,1]},
  bottom: {normal:[0,-1,0], right:[1,0,0], down:[0,0,-1]},
};
export const cubeFaces = Object.keys(cubeFrames) as CubeFace[];
export interface CubeCell {face: CubeFace; x: number; y: number}
export interface CubeNeighbor extends CubeCell {entry: Direction}
export interface PrismDimensions {width:number;depth:number;height:number}
export function faceSize(face:CubeFace,size:number,dimensions?:PrismDimensions):{width:number;height:number}{
  if(!dimensions)return{width:size,height:size};
  return{width:face==='left'||face==='right'?dimensions.depth:dimensions.width,height:face==='top'||face==='bottom'?dimensions.depth:dimensions.height};
}
export function cubeCell(index: number,size: number,faces: readonly CubeFace[],dimensions?:PrismDimensions): CubeCell {
  for(const face of faces){const grid=faceSize(face,size,dimensions);if(index<grid.width*grid.height)return{face,x:index%grid.width,y:Math.floor(index/grid.width)};index-=grid.width*grid.height;}
  throw new Error('Invalid surface index');
}
export function cubeIndex(cell: CubeCell,size: number,faces: readonly CubeFace[],dimensions?:PrismDimensions): number {
  let offset=0;for(const face of faces){const grid=faceSize(face,size,dimensions);if(face===cell.face)return offset+cell.y*grid.width+cell.x;offset+=grid.width*grid.height;}throw new Error('Face is not enabled');
}
export function boardNeighbor(state: {width:number;height:number;cubeFaces?:CubeFace[];cubeDimensions?:PrismDimensions},index:number,direction:Direction): {index:number;entry:Direction}|null {
  if(state.cubeFaces){const next=cubeNeighbor(cubeCell(index,state.width,state.cubeFaces,state.cubeDimensions),direction,state.width,state.cubeFaces,state.cubeDimensions);return next?{index:cubeIndex(next,state.width,state.cubeFaces,state.cubeDimensions),entry:next.entry}:null;}
  const x=index%state.width+[0,1,0,-1][direction],y=Math.floor(index/state.width)+[-1,0,1,0][direction];
  return x<0||y<0||x>=state.width||y>=state.height?null:{index:y*state.width+x,entry:((direction+2)%4) as Direction};
}
const dot = (a: Vector,b: Vector) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const negate = (a: Vector): Vector => [-a[0],-a[1],-a[2]];
function outward(face: CubeFace, direction: Direction): Vector {
  const frame=cubeFrames[face];
  return [negate(frame.down),frame.right,frame.down,negate(frame.right)][direction];
}
export function adjacentFace(face: CubeFace,direction: Direction): CubeFace {
  const normal=outward(face,direction);
  return cubeFaces.find(candidate=>dot(cubeFrames[candidate].normal,normal)===1)!;
}
export function connectedFaces(faces: readonly CubeFace[]): boolean {
  if (!faces.length || new Set(faces).size!==faces.length || faces.some(face=>!cubeFaces.includes(face))) return false;
  const seen=new Set<CubeFace>([faces[0]]), queue=[faces[0]];
  for (const face of queue) for (const direction of [0,1,2,3] as const) {
    const next=adjacentFace(face,direction);
    if (faces.includes(next)&&!seen.has(next)) {seen.add(next);queue.push(next);}
  }
  return seen.size===faces.length;
}
export function cubeNeighbor(cell: CubeCell,direction: Direction,size: number,enabled: readonly CubeFace[],dimensions?:PrismDimensions): CubeNeighbor | null {
  const grid=faceSize(cell.face,size,dimensions);
  if (!Number.isInteger(size)||size<1||!enabled.includes(cell.face)||!Number.isInteger(cell.x)||!Number.isInteger(cell.y)||cell.x<0||cell.y<0||cell.x>=grid.width||cell.y>=grid.height) throw new Error('Invalid cube cell');
  const x=cell.x+[0,1,0,-1][direction], y=cell.y+[-1,0,1,0][direction];
  if (x>=0&&x<grid.width&&y>=0&&y<grid.height) return {face:cell.face,x,y,entry:((direction+2)%4) as Direction};
  const face=adjacentFace(cell.face,direction);
  if (!enabled.includes(face)) return null;
  const source=cubeFrames[cell.face], target=cubeFrames[face];
  const entry=([0,1,2,3] as const).find(d=>dot(outward(face,d),source.normal)===1)!;
  const targetGrid=faceSize(face,size,dimensions),length=direction%2===0?grid.width:grid.height;
  const along=direction%2===0?cell.x:cell.y;
  const sourceTangent=direction%2===0?source.right:source.down;
  const targetTangent=entry%2===0?target.right:target.down;
  const mapped=dot(sourceTangent,targetTangent)===1?along:length-1-along;
  return {face,x:entry===1?targetGrid.width-1:entry===3?0:mapped,y:entry===0?0:entry===2?targetGrid.height-1:mapped,entry};
}
