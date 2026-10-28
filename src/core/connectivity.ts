import { ports } from './pieces.ts';
import {boardNeighbor} from './cube-topology.ts';
import type { Energy, PuzzleState } from './state.ts';

export function traceEnergy(state: Pick<PuzzleState, 'width' | 'height' | 'tiles' | 'cubeFaces' | 'cubeDimensions'>) {
  const sources: number[] = [];
  const targets: number[] = [];
  state.tiles.forEach((tile, index) => {
    if (tile?.terminal === 'source') sources.push(index);
    if (tile?.terminal === 'target') targets.push(index);
  });
  const poweredBy: Energy[][] = state.tiles.map(() => []);
  const queue = sources.map((index) => ({ index, energy: state.tiles[index]!.energy ?? 'azure' as Energy }));
  for (const { index, energy } of queue) if (!poweredBy[index].includes(energy)) poweredBy[index].push(energy);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { index, energy } = queue[cursor];
    const tile = state.tiles[index];
    if (!tile) continue;
    for (const direction of ports(tile)) {
      const step=boardNeighbor(state,index,direction);
      if(!step)continue;
      const neighbor=step.index;
      const nextTile = state.tiles[neighbor];
      if (!nextTile || !ports(nextTile).includes(step.entry)) continue;
      if (!poweredBy[neighbor].includes(energy)) {
        poweredBy[neighbor].push(energy);
        queue.push({ index: neighbor, energy });
      }
    }
  }
  const powered = poweredBy.flatMap((energies, index) => energies.length ? [index] : []);
  const mixed = powered.filter((index) => poweredBy[index].length > 1);
  const poweredTargets = targets.filter((index) => poweredBy[index].length === 1 && poweredBy[index][0] === (state.tiles[index]!.energy ?? 'azure'));
  return { powered, targets, poweredTargets, poweredBy, mixed,
    solved: sources.length > 0 && targets.length > 0 && poweredTargets.length === targets.length && mixed.length === 0 };
}
