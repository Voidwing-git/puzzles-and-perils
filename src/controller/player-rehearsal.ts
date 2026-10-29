import { applyCommand } from '../core/commands.ts';
import { applyAdmin } from '../core/admin.ts';
import { projectPublic } from '../core/projection.ts';
import type { PublicPuzzle, Command,PrivatePreparation } from '../core/state.ts';
import {applyAdventure} from '../core/adventure.ts';
import type { FixtureId } from '../core/fixtures.ts';

// No transport dependency: a rehearsal cannot publish a command or snapshot.
export class PlayerRehearsal {
  #puzzle: PublicPuzzle;
  #private?:PrivatePreparation;
  constructor(source: PublicPuzzle, privateFixture: FixtureId,preparation?:PrivatePreparation) {
    this.#puzzle = structuredClone(source);
    this.fixture = privateFixture;
    if((source.puzzleType==='challenge'||source.puzzleType==='lockpick'||source.puzzleType==='ring-door')&&preparation){this.#private=structuredClone(preparation);this.#private.state=structuredClone(source);}
  }
  private fixture: FixtureId;
  snapshot() { return structuredClone(this.#puzzle); }
  request(command: Command, viewer: string, asHost: boolean) {
    if(!asHost&&!this.#puzzle.participants.some(p=>p.id===viewer))return{accepted:false as const,reason:'unknown-player' as const,snapshot:this.snapshot()};
    const actor = { id: viewer, role: asHost ? 'GM' as const : 'PLAYER' as const };
    if(this.#private){
      const transition=applyAdventure(this.#private,command,actor);
      if(transition.result.accepted){this.#private=transition.preparation;this.#puzzle=projectPublic(this.#private);}
      return transition.result.accepted?{accepted:true as const,snapshot:this.snapshot()}:{accepted:false as const,reason:transition.result.reason,snapshot:this.snapshot()};
    }
    const result = applyAdmin(this.#puzzle, command, actor, this.fixture) ?? applyCommand(this.#puzzle, command, actor);
    if (result.accepted) this.#puzzle = {...projectPublic({ state: result.state, seed: '', solution: [], withheld: [] }),missingCount:this.#puzzle.missingCount,missingSockets:this.#puzzle.missingSockets};
    return result.accepted ? { accepted: true as const, snapshot: this.snapshot() }
      : { accepted: false as const, reason: result.reason, snapshot: this.snapshot() };
  }
}
