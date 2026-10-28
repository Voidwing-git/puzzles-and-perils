import { applyCommand } from '../core/commands.ts';
import { applyAdmin } from '../core/admin.ts';
import { projectPublic } from '../core/projection.ts';
import type { PublicPuzzle, Command } from '../core/state.ts';
import type { FixtureId } from '../core/fixtures.ts';

// No transport dependency: a rehearsal cannot publish a command or snapshot.
export class PlayerRehearsal {
  #puzzle: PublicPuzzle;
  constructor(source: PublicPuzzle, privateFixture: FixtureId) {
    this.#puzzle = structuredClone(source);
    this.fixture = privateFixture;
  }
  private fixture: FixtureId;
  snapshot() { return structuredClone(this.#puzzle); }
  request(command: Command, viewer: string, asHost: boolean) {
    const actor = { id: viewer, role: asHost ? 'GM' as const : 'PLAYER' as const };
    const result = applyAdmin(this.#puzzle, command, actor, this.fixture) ?? applyCommand(this.#puzzle, command, actor);
    if (result.accepted) this.#puzzle = {...projectPublic({ state: result.state, seed: '', solution: [], withheld: [] }),missingCount:this.#puzzle.missingCount,missingSockets:this.#puzzle.missingSockets};
    return result.accepted ? { accepted: true as const, snapshot: this.snapshot() }
      : { accepted: false as const, reason: result.reason, snapshot: this.snapshot() };
  }
}
