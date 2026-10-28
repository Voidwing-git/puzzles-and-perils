import { boardCoordinate, ports } from '../core/pieces.ts';
import type { PublicPuzzle,Tile } from '../core/state.ts';

const ends = [[50, 0], [100, 50], [50, 100], [0, 50]];
export const directionNames = ['north', 'east', 'south', 'west'];

// A stationary stone socket seam, separate from the rotating pipe artwork.
export function socketFractures(): string {
  return `<svg class="socket-fractures" viewBox="0 0 100 100" aria-hidden="true">
    <path class="fracture-edge" d="M3 14L5 7L15 5L19 9L24 4L38 5L42 2L58 4L64 7L70 3L85 5L89 10L96 13L93 22L97 29L94 40L98 48L95 61L97 69L93 76L95 87L88 94L77 92L70 97L59 94L47 98L38 94L28 96L22 91L11 94L5 86L8 75L3 67L6 55L2 43L6 33L3 24Z"/>
    <path class="fracture-shadow" d="M19 0L19 9L24 14L22 20M24 14L30 16M64 0L64 7L59 12L62 18M100 29L94 29L88 35L84 33M100 69L93 69L88 64L81 66M77 100L77 92L72 86L75 80M28 100L28 96L33 88L30 83M0 67L3 67L11 62L16 65M0 24L3 24L10 29L15 26"/>
    <path class="fracture-highlight" d="M20 2L20 8L25 13M65 2L65 7L60 12M97 30L94 30L89 35M96 70L93 70L88 65M78 97L78 92L73 86M29 97L34 88M4 68L12 63M4 25L10 30"/>
  </svg>`;
}

export function tileLabel(state: PublicPuzzle, index: number): string {
  const tile = state.tiles[index];
  const position = boardCoordinate(state,index);
  if (!tile) return `${position}, empty socket`;
  const power = state.mixed.includes(index) ? 'mixed energy' : state.poweredBy[index]?.length ? `${state.poweredBy[index][0]} powered` : 'unpowered';
  return `${position}, ${tile.terminal ?? tile.shape}${tile.terminal ? ` (${tile.energy ?? 'azure'})` : ''}, openings ${ports(tile).map((port) => directionNames[port]).join(' and ')}, ${power}${tile.terminal ? ', fixed' : ''}`;
}

export function tileSvg(state: PublicPuzzle, index: number): string {
  return tileArtwork(state.tiles[index],boardCoordinate(state,index),state.powered.includes(index));
}

export function tileArtwork(tile:Tile|null,position:string,powered:boolean):string {
  // Position may originate in scene metadata. It is text inside SVG markup.
  position=position.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!));
  if (!tile) return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect class="socket-border" x="12" y="12" width="76" height="76" rx="6"/><path class="socket-mark" d="M42 50h16M50 42v16"/><text class="tile-coordinate" x="9" y="93">${position}</text></svg>`;
  const path = ports(tile).map((port) => `M50 50L${ends[port][0]} ${ends[port][1]}`).join(' ');
  const glyph = tile.energy === 'verdant' ? 'M38 38H62V62H38Z' : (tile.energy ?? 'azure') === 'amber' ? 'm50 34 14 28H36Z' : 'm50 34 10 16-10 16-10-16Z';
  const symbol = tile.terminal === 'source'
    ? `<circle class="terminal-base" cx="50" cy="50" r="20"/><path class="terminal-glyph" d="${glyph}"/>`
    : tile.terminal === 'target'
      ? `<path class="terminal-base" d="m50 27 23 23-23 23-23-23Z"/><path class="terminal-glyph" d="${glyph}"/>`
      : '<circle class="joint" cx="50" cy="50" r="8"/><circle class="joint-core" cx="50" cy="50" r="3"/>';
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <path class="tile-etching" d="M9 25V9h16M75 9h16v16M91 75v16H75M25 91H9V75"/>
    <g class="rotating-piece"><path class="channel-shadow" d="${path}"/><path class="channel-rim" d="${path}"/>
    <path class="channel-core" d="${path}"/><path class="channel-light" d="${path}"/>
    ${symbol}</g><text class="tile-coordinate" x="9" y="93">${position}</text>
    ${powered ? '<path class="powered-mark" d="m86 7 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/>' : ''}
  </svg>`;
}
