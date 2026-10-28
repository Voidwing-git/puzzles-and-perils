import { cloneTile } from './state.ts';
import type { Direction, PrivatePreparation, Tile } from './state.ts';

export const fixtureOptions = [
  { id: 'relay', name: 'The arcane relay', description: 'Awaken both runes. Follow the engraved channels and take turns rotating the tiles.' },
  { id: 'last-connection', name: 'The last connection', description: 'One clockwise rotation will finish this board. A short introduction to the rules.' },
  { id: 'broken-conduit', name: 'The broken conduit', description: 'An empty socket breaks the upper branch. The host can recover the missing piece during the adventure.' },
  { id: 'dual-power', name: 'The twin currents', description: 'Azure ◇ and amber △ must reach matching runes. Keep the two currents separate; mixed energy cannot awaken a rune.' },
] as const;
export type FixtureId = typeof fixtureOptions[number]['id'];

export function createFixture(id: FixtureId, instanceId = `demo-${id}`): PrivatePreparation {
  if (id === 'dual-power') return createDualPower(instanceId);
  const solution: (Tile | null)[] = Array.from({ length: 25 }, () => null);
  const set = (index: number, shape: Tile['shape'], rotation: Direction, terminal?: Tile['terminal']) => {
    solution[index] = terminal ? { shape, rotation, terminal } : { shape, rotation };
  };
  // A3 -> B3 branches north through B2 to E2, and east through C3/C4 to E4.
  set(10, 'endpoint', 1, 'source');
  set(11, 'tee', 0);
  set(6, 'elbow', 1);
  set(7, 'straight', 1);
  set(8, 'straight', 1);
  set(9, 'endpoint', 3, 'target');
  set(12, 'elbow', 2);
  set(17, 'elbow', 0);
  set(18, 'straight', 1);
  set(19, 'endpoint', 3, 'target');
  // Decorative unpowered pieces provide additional legal moves and loose ends.
  set(0, 'elbow', 0); set(2, 'straight', 0); set(4, 'endpoint', 2);
  set(15, 'tee', 1); set(21, 'elbow', 2); set(23, 'straight', 0);
  const tiles = solution.map(cloneTile);
  tiles[6]!.rotation = id === 'relay' ? 3 : 0;
  if (id === 'relay') {
    tiles[11]!.rotation = 1;
    tiles[12]!.rotation = 1;
    tiles[18]!.rotation = 0;
  }
  const withheld = id === 'broken-conduit'
    ? [{ id: 'fixture-missing-piece', index: 6, tile: cloneTile(solution[6])!, discoveryLabel: 'Under the archivist’s desk' }]
    : [];
  if (id === 'broken-conduit') tiles[6] = null;
  return {
    seed: 'm1-curated-demo-only', solution, withheld,
    state: { schemaVersion: 2, puzzleId: instanceId, title: fixtureOptions.find((option) => option.id === id)!.name,
      width: 5, height: 5, tiles, participants: [{ id: 'lyra', name: 'Lyra' }, { id: 'orin', name: 'Orin' }],
      activeIndex: 0, mode: 'turns', turnEdit: null, revision: 0 },
  };
}

function createDualPower(instanceId: string): PrivatePreparation {
  const preparation = createFixture('relay', instanceId);
  const solution: (Tile | null)[] = Array.from({ length: 25 }, () => null);
  solution[5] = { shape: 'endpoint', rotation: 1, terminal: 'source', energy: 'azure' };
  solution[9] = { shape: 'endpoint', rotation: 3, terminal: 'target', energy: 'azure' };
  solution[15] = { shape: 'endpoint', rotation: 1, terminal: 'source', energy: 'amber' };
  solution[19] = { shape: 'endpoint', rotation: 3, terminal: 'target', energy: 'amber' };
  // T-junctions permit an incorrect bridge between the two powered rows.
  solution[6] = { shape: 'tee', rotation: 0 };
  solution[16] = { shape: 'tee', rotation: 2 };
  solution[11] = { shape: 'straight', rotation: 0 };
  for (const index of [7, 8, 17, 18]) solution[index] = { shape: 'straight', rotation: 1 };
  const tiles = solution.map(cloneTile);
  tiles[6]!.rotation = 1;
  tiles[17]!.rotation = 0;
  return { ...preparation, solution, withheld: [], state: { ...preparation.state,
    title: 'The twin currents', tiles } };
}
