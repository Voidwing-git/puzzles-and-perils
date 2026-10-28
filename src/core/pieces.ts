import type { Direction, Shape, Tile } from './state.ts';
import {cubeCell} from './cube-topology.ts';
import type {PuzzleState} from './state.ts';

const openings: Record<Shape, readonly Direction[]> = {
  straight: [0, 2], elbow: [0, 1], tee: [0, 1, 3], endpoint: [0],
};

export function ports(tile: Tile): Direction[] {
  return openings[tile.shape].map((port) => ((port + tile.rotation) % 4) as Direction);
}

export function coordinate(index: number, width: number): string {
  return `${String.fromCharCode(65 + index % width)}${Math.floor(index / width) + 1}`;
}
export function boardCoordinate(state: Pick<PuzzleState,'width'|'cubeFaces'|'cubeDimensions'>,index:number):string {
  if(!state.cubeFaces)return coordinate(index,state.width);
  const cell=cubeCell(index,state.width,state.cubeFaces,state.cubeDimensions);
  return `${cell.face} ${coordinate(cell.y*state.width+cell.x,state.width)}`;
}
