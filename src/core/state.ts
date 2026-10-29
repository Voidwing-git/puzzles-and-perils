export type Direction = 0 | 1 | 2 | 3; // North, east, south, west.
export type Shape = 'straight' | 'elbow' | 'tee' | 'endpoint';
export type Terminal = 'source' | 'target';
export type Energy = 'azure' | 'amber' | 'verdant';
export interface Tile {
  shape: Shape;
  rotation: Direction;
  terminal?: Terminal;
  energy?: Energy;
}
export interface Participant { id: string; name: string }
export type LockDifficulty = 'novice' | 'apprentice' | 'adept' | 'expert' | 'master';
export interface LockState {
  difficulty: LockDifficulty;
  pickHealth: number;
  brokenPicks: number;
  attempts: number;
  angle: number;
  turn: number;
  opened: boolean;
  probeActor: string;
  tensionMs?: number;
  binding?: boolean;
}
export interface PuzzleState {
  puzzleType?: 'pipes' | 'lockpick';
  lockpick?: LockState;
  cubeFaces?: import('./cube-topology.ts').CubeFace[];
  cubeDimensions?: import('./cube-topology.ts').PrismDimensions;
  paused?: boolean;
  schemaVersion: 2;
  puzzleId: string;
  title: string;
  width: number;
  height: number;
  tiles: (Tile | null)[];
  participants: Participant[];
  rosterCustomized?: boolean;
  activeIndex: number;
  mode: 'turns' | 'free';
  turnEdit: { tileIndex: number; originalRotation: Direction; placedPiece?: string } | null;
  inventory?: { id: string; tile: Tile }[];
  placements?: {id: string; tileIndex: number}[];
  revision: number;
}
export interface PrivatePreparation {
  lockSecret?: {sweetSpot:number};
  history?: string[];
  actionHistory?: {revision:number;action:string;actor:string;name?:string;at?:number;detail?:string}[];
  state: PuzzleState;
  seed: string;
  solution: (Tile | null)[];
  withheld: { id?: string; index: number; tile: Tile; discoveryLabel: string; notes?: string }[];
  recoveryMode?: 'socket' | 'tray';
  recoveryDestinations?: Record<number, 'socket' | 'tray'>;
  trayOrigins?: Record<string, { id?: string; index: number; tile: Tile; discoveryLabel: string }>;
  hiddenInventory?: { id: string; tile: Tile; origin?: { id?: string; index: number; tile: Tile; discoveryLabel: string } }[];
  startingState?: PuzzleState;
  startingWithheld?: { id?: string; index: number; tile: Tile; discoveryLabel: string }[];
}
export interface PublicPuzzle extends PuzzleState {
  missingCount?: number;
  missingSockets?: number[];
  powered: number[];
  targets: number[];
  poweredTargets: number[];
  solved: boolean;
  connected: boolean;
  poweredBy: Energy[][];
  mixed: number[];
}
export interface Actor { id: string; role: 'GM' | 'PLAYER'; name?:string }
export type Command =
  | {type:'pick-lock';angle:number;strain:boolean;puzzleId:string;expectedRevision:number}
  | {type:'give-lockpick';puzzleId:string;expectedRevision:number}
  | {type:'undo'|'pause-puzzle'|'resume-puzzle';puzzleId:string;expectedRevision:number}
  | { type: 'gm-rotate' | 'recall-piece'; tileIndex: number; puzzleId: string; expectedRevision: number }
  | { type: 'publish-draft'; draftId: string; puzzleId: string; expectedRevision: number }
  | { type: 'restore-draft'; draftId: string; puzzleId: string; expectedRevision: number }
  | { type: 'recover'; destination?: 'socket' | 'tray'; pieceId: string; puzzleId: string; expectedRevision: number }
  | { type: 'return-piece'; pieceId: string; puzzleId: string; expectedRevision: number }
  | { type: 'hide-piece'; pieceId: string; puzzleId: string; expectedRevision: number }
  | { type: 'place'; pieceId: string; tileIndex: number; puzzleId: string; expectedRevision: number }
  | { type: 'rotate'; tileIndex: number; puzzleId: string; expectedRevision: number }
  | { type: 'select'; tileIndex: number; puzzleId: string; expectedRevision: number }
  | { type: 'set-roster'; playerIds: string[]; puzzleId: string; expectedRevision: number }
  | { type: 'set-mode'; mode: 'turns' | 'free'; puzzleId: string; expectedRevision: number }
  | { type: 'advance-turn' | 'reset-puzzle' | 'complete-puzzle' | 'sync-players'; puzzleId: string; expectedRevision: number };

export function cloneTile(tile: Tile | null): Tile | null {
  if (!tile) return null;
  const result: Tile = { shape: tile.shape, rotation: tile.rotation };
  if (tile.terminal) result.terminal = tile.terminal;
  if (tile.energy) result.energy = tile.energy;
  return result;
}
