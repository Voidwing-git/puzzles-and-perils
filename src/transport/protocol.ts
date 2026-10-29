import type { Command, PublicPuzzle } from '../core/state.ts';
import {validChallengeAction} from '../core/challenges.ts';
import type { FixtureId } from '../core/fixtures.ts';

export const KEY = 'com.arcane-pipes/shared-v1';
export const CHANNEL = 'com.arcane-pipes/requests-v1';
export const TOKEN_KEY = 'com.arcane-pipes/token-v1';
export interface Request { id: string; generation: string; expiresAt: number; command: Command; tokenId?: string; fixture?: FixtureId }
export interface Receipt { id: string; connection: string; revision: number; accepted: boolean; reason?: string }
export interface Shared {
  version: 1;
  owner: string;
  generation: string;
  puzzle: PublicPuzzle;
  receipts: Receipt[];
  tokenId?: string;
  fixture?: FixtureId;
}
export function parseRequest(value: unknown): Request | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Request;
  if (typeof r.id !== 'string' || r.id.length > 80 || !r.id || typeof r.generation !== 'string') return null;
  if (!Number.isSafeInteger(r.expiresAt) || r.expiresAt <= 0) return null;
  if (r.tokenId !== undefined && (typeof r.tokenId !== 'string' || !r.tokenId || r.tokenId.length > 100)) return null;
  if (r.fixture !== undefined && !['relay', 'last-connection', 'dual-power'].includes(r.fixture)) return null;
  const c = r.command;
  if (!c || typeof c.puzzleId !== 'string' || !Number.isSafeInteger(c.expectedRevision) || c.expectedRevision < 0) return null;
  if(c.type==='challenge-action'){
    if(!validChallengeAction(c.action))return null;
  }else if(c.type==='rotate-ring'){
    if(!Number.isInteger(c.ring)||c.ring<0||c.ring>2)return null;
  } else if(c.type==='pick-lock'){
    if(!Number.isInteger(c.angle)||Math.abs(c.angle)>90||typeof c.strain!=='boolean')return null;
  } else if (c.type === 'rotate' || c.type === 'select' || c.type === 'place' || c.type === 'gm-rotate' || c.type === 'recall-piece') {
    if (!Number.isInteger(c.tileIndex) || c.tileIndex < 0 || c.tileIndex >= 96) return null;
    if (c.type === 'place' && (typeof c.pieceId !== 'string' || !/^recovered-[\d-]{1,40}$/.test(c.pieceId))) return null;
  } else if (c.type === 'publish-draft'||c.type==='restore-draft') {
    if (typeof c.draftId !== 'string' || !/^[\w-]{1,80}$/.test(c.draftId)) return null;
  } else if (c.type === 'hide-piece' || c.type === 'return-piece') {
    if (typeof c.pieceId !== 'string' || !/^recovered-[\d-]{1,40}$/.test(c.pieceId)) return null;
  } else if (c.type === 'recover') {
    if (c.destination !== undefined && c.destination !== 'socket' && c.destination !== 'tray') return null;
    if (typeof c.pieceId !== 'string' || !/^[\w-]{1,80}$/.test(c.pieceId)) return null;
  } else if (c.type === 'set-roster') {
    if (!Array.isArray(c.playerIds) || c.playerIds.length > 32 || new Set(c.playerIds).size !== c.playerIds.length || c.playerIds.some(id=>typeof id!=='string'||!id.length||id.length>128)) return null;
  } else if (c.type === 'set-mode') {
    if (c.mode !== 'turns' && c.mode !== 'free') return null;
  } else if (!['advance-turn', 'reset-puzzle', 'complete-puzzle', 'sync-players','undo','pause-puzzle','resume-puzzle','give-lockpick'].includes(c.type)) return null;
  return r;
}
export function assertFits(metadata: Record<string, unknown>, shared: Shared) {
  const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
  if (bytes(shared) >= 8192 || bytes({ ...metadata, [KEY]: shared }) >= 16000)
    throw new Error('Room metadata is full. Free space before retrying; other extension data was preserved.');
}
