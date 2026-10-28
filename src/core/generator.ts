import { ports } from './pieces.ts';
import { traceEnergy } from './connectivity.ts';
import type { Direction, Energy, PrivatePreparation, Tile } from './state.ts';

export interface GenerationSettings { size: number; powers: number; targets: number; seed: string }

// Seeded disjoint tree networks with separated leaf goals.
// Terminals retain their solved orientation; only ordinary pieces scramble.
export function generate(settings: GenerationSettings, puzzleId: string): PrivatePreparation {
  const { size, powers, targets, seed } = settings;
  if (![4, 5, 6].includes(size) || ![1, 2, 3].includes(powers) || ![1, 2].includes(targets) ||
      typeof seed !== 'string' || !seed.length || seed.length > 100)
    throw new Error('Choose size 4–6, 1–3 currents, 1–2 targets per current, and a seed of 1–100 characters.');
  let hash = 2166136261;
  for (const c of seed) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const random = () => { hash ^= hash << 13; hash ^= hash >>> 17; hash ^= hash << 5; return (hash >>> 0) / 4294967296; };
  const energies: Energy[] = ['azure', 'amber', 'verdant'];
  const adjacent = (a: number, b: number) => Math.abs(a % size - b % size) + Math.abs(Math.floor(a / size) - Math.floor(b / size)) === 1;
  const direction = (a: number, b: number): Direction => (b === a - size ? 0 : b === a + size ? 2 : b === a + 1 ? 1 : 3);
  let solution: (Tile | null)[] | null = null;
  // Bounded, seeded retries: partition the grid into connected regions, then
  // build a tree inside each. Goals are leaves, never pass-through terminals.
  for (let layoutAttempt = 0; layoutAttempt < 1024 && !solution; layoutAttempt++) {
    const transform = Math.floor(random() * 8);
    const path = Array.from({ length: size * size }, (_, i) => {
      let y = Math.floor(i / size), x = y % 2 ? size - 1 - i % size : i % size;
      if (transform & 1) x = size - 1 - x;
      if (transform & 2) y = size - 1 - y;
      if (transform & 4) [x, y] = [y, x];
      return y * size + x;
    });
    for (let step = 0; step < size * size * 12; step++) {
      if (random() < 0.5) path.reverse();
      const neighbors = path.filter(index => index !== path[1] && adjacent(index, path[0]));
      if (!neighbors.length) continue;
      const cut = path.indexOf(neighbors[Math.floor(random() * neighbors.length)]);
      path.splice(0, cut, ...path.slice(0, cut).reverse());
    }
    const lengths = Array<number>(powers).fill(targets + 3);
    for (let extra = path.length - powers * (targets + 3); extra > 0; extra--) lengths[Math.floor(random() * powers)]++;
    const regions: { nodes: number[]; edges: Map<number, number[]>; options: { goals: number[]; source: number }[] }[] = [];
    let offset = 0;
    const groups = lengths.map(length => { const nodes = path.slice(offset,offset+length);offset+=length;return nodes; });
    for (const nodes of groups) {
      const edges = new Map(nodes.map(index => [index, [] as number[]]));
      const visited = new Set<number>();
      const stack = [nodes[Math.floor(random() * nodes.length)]]; visited.add(stack[0]);
      while (stack.length) {
        const at = stack[stack.length - 1];
        const next = nodes.filter(index => !visited.has(index) && adjacent(at, index));
        if (!next.length) { stack.pop(); continue; }
        const neighbor = next[Math.floor(random() * next.length)];
        edges.get(at)!.push(neighbor); edges.get(neighbor)!.push(at);
        visited.add(neighbor); stack.push(neighbor);
      }
      if ([...edges.values()].some(neighbors => neighbors.length > 3)) break;
      const leaves = nodes.filter(index => edges.get(index)!.length === 1);
      const options: { goals: number[]; source: number }[] = [];
      for (let i = 0; i < leaves.length; i++) for (let j = targets === 1 ? i : i + 1; j < (targets === 1 ? i + 1 : leaves.length); j++) {
        const goals = targets === 1 ? [leaves[i]] : [leaves[i], leaves[j]];
        if (goals.length === 2 && adjacent(goals[0], goals[1])) continue;
        const sources = nodes.filter(index => !goals.includes(index) && goals.every(goal => !adjacent(index, goal)));
        if (sources.length) options.push({goals,source:sources[Math.floor(random() * sources.length)]});
      }
      // Shuffle with the seeded PRNG, keeping repeatable generation.
      for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [options[i],options[j]] = [options[j],options[i]]; }
      if (!options.length) break;
      regions.push({nodes,edges,options});
    }
    if (regions.length !== powers) continue;
    const chosen = regions.map(region => region.options[0]);
    const candidate: (Tile | null)[] = Array(size * size).fill(null);
    regions.forEach((region,power) => region.nodes.forEach(index => {
      const openings = region.edges.get(index)!.map(neighbor => direction(index,neighbor));
      const shape = openings.length === 1 ? 'endpoint' : openings.length === 3 ? 'tee' : (openings[0] + 2) % 4 === openings[1] ? 'straight' : 'elbow';
      const rotation = ([0,1,2,3] as Direction[]).find(rotation => openings.every(d => ports({shape,rotation}).includes(d)))!;
      candidate[index] = {shape,rotation,...(chosen[power].goals.includes(index) ? {terminal:'target' as const,energy:energies[power]} :
        chosen[power].source === index ? {terminal:'source' as const,energy:energies[power]} : {})};
    }));
    solution = candidate;
  }
  if (!solution) throw new Error('No separated-endpoint layout found within 1024 attempts. Choose another seed.');
  for (let attempt = 0; attempt < 64; attempt++) {
    const tiles = solution.map(tile => tile!.terminal ? { ...tile! } : { ...tile!, rotation: Math.floor(random() * 4) as Direction });
    const state = { schemaVersion: 2 as const, puzzleId, title: 'Generated conduit', width: size, height: size,
      tiles, participants: [{ id: 'lyra', name: 'Lyra' }, { id: 'orin', name: 'Orin' }], activeIndex: 0,
      mode: 'turns' as const, turnEdit: null, revision: 0, inventory: [] };
    if (!traceEnergy(state).solved) return { state, solution, seed, withheld: [], recoveryMode: 'socket' };
  }
  throw new Error('No unsolved scramble found within 64 attempts. Choose another seed.');
}

export function withhold(preparation: PrivatePreparation, index: number, discoveryLabel: string) {
  const tile = preparation.state.tiles[index];
  if (!tile || tile.terminal || discoveryLabel.length > 120) throw new Error('Choose an ordinary present piece and a label up to 120 characters.');
  const next = structuredClone(preparation);
  next.withheld.push({ id: crypto.randomUUID(), index, tile: { ...tile }, discoveryLabel });
  next.state.tiles[index] = null;
  const placement=next.state.placements?.find(p=>p.tileIndex===index);
  next.state.placements=next.state.placements?.filter(p=>p.tileIndex!==index);
  if(placement&&next.trayOrigins)delete next.trayOrigins[placement.id];
  return next;
}
