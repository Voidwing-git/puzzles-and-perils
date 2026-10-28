import { rollbackPreview } from './commands.ts';
import { createFixture } from './fixtures.ts';
import type { FixtureId } from './fixtures.ts';
import type { Actor, Command, Participant, PuzzleState } from './state.ts';
import type { CommandResult } from './commands.ts';

export function applyAdmin(state: PuzzleState, command: Command, actor: Actor, fixture: FixtureId, roster?: Participant[]): CommandResult | null {
  if (!['reset-puzzle', 'complete-puzzle', 'sync-players', 'set-roster'].includes(command.type)) return null;
  const reject = (reason: 'wrong-puzzle' | 'stale-revision' | 'gm-only' | 'invalid-roster'): CommandResult => ({ accepted: false, state, reason });
  if (command.puzzleId !== state.puzzleId) return reject('wrong-puzzle');
  if (command.expectedRevision !== state.revision) return reject('stale-revision');
  if (actor.role !== 'GM') return reject('gm-only');
  if(command.type === 'set-roster') {
    if(command.playerIds.length>32 || new Set(command.playerIds).size!==command.playerIds.length) return reject('invalid-roster');
    const allowed=new Map([...state.participants,...(roster??[])].map(p=>[p.id,p]));
    if(command.playerIds.some(id=>!allowed.has(id)))return reject('invalid-roster');
    const participants=command.playerIds.length ? command.playerIds.map(id=>({...allowed.get(id)!})) : [{id:actor.id,name:'GM (solo seat)'}];
    const active=state.participants[state.activeIndex]?.id;
    const retained=participants.findIndex(p=>p.id===active);
    return {accepted:true,state:{...rollbackPreview(state),participants,rosterCustomized:true,activeIndex:retained>=0?retained:Math.min(state.activeIndex,participants.length-1),turnEdit:null,revision:state.revision+1}};
  }
  const prepared = createFixture(fixture, state.puzzleId);
  return { accepted: true, state: { ...state,
    tiles: command.type === 'reset-puzzle' ? prepared.state.tiles : command.type === 'complete-puzzle' ? prepared.solution : state.tiles,
    ...(command.type==='sync-players'?{rosterCustomized:false}:{}),
    participants: command.type === 'sync-players' && roster?.length ? roster : state.participants,
    activeIndex: command.type === 'complete-puzzle' ? state.activeIndex : 0,
    turnEdit: null, revision: state.revision + 1,
  } };
}
