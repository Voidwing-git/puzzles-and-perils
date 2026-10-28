import { createFixture } from '../core/fixtures.ts';
import type { FixtureId } from '../core/fixtures.ts';
import { projectPublic } from '../core/projection.ts';
import type { Actor, Command, PublicPuzzle } from '../core/state.ts';
import type { PrivatePreparation } from '../core/state.ts';
import { applyAdventure } from '../core/adventure.ts';
import {validatePreparation,rekeyPreparation} from '../core/save-format.ts';
import {puzzleEvent} from '../core/event-history.ts';

// M1 authority: the view receives detached public snapshots, never preparation.
export class LocalController {
  private persist: (p: PrivatePreparation) => void;
  constructor(persist: (p: PrivatePreparation) => void = () => {},initial?:PrivatePreparation) {
    this.persist = persist;
    if(initial)this.#preparation=validatePreparation(initial);
    this.#preparation.startingState ??= structuredClone(this.#preparation.state);
    this.#preparation.startingWithheld ??= structuredClone(this.#preparation.withheld);
  }
  #instance = 1;
  #fixture: FixtureId = 'relay';
  #preparation = createFixture('relay', 'local-1');

  snapshot(): PublicPuzzle { return projectPublic(this.#preparation); }
  privatePreparation() { return structuredClone(this.#preparation); }
  publish(preparation: PrivatePreparation) {
    const next = structuredClone(preparation);
    next.startingState = structuredClone(preparation.state);
    next.startingWithheld = structuredClone(preparation.withheld);
    next.history=[];
    next.actionHistory=[...(next.actionHistory??[]).slice(-31),puzzleEvent(next,{type:'publish-draft',draftId:next.state.puzzleId,puzzleId:next.state.puzzleId,expectedRevision:next.state.revision},{id:'demo-host',role:'GM',name:'GM'},next.state.revision)];
    this.persist(next);
    this.#preparation = next;
    return this.snapshot();
  }

  restore(preparation:PrivatePreparation){
    const next=rekeyPreparation(validatePreparation(preparation),crypto.randomUUID());
    next.actionHistory=[...(next.actionHistory??[]).slice(-31),puzzleEvent(next,{type:'restore-draft',draftId:next.state.puzzleId,puzzleId:next.state.puzzleId,expectedRevision:next.state.revision},{id:'demo-host',role:'GM',name:'GM'},next.state.revision)];
    this.persist(next);this.#preparation=next;return this.snapshot();
  }

  submit(command: Command, actor: Actor) {
    const { result, preparation } = applyAdventure(this.#preparation, command, actor, this.#fixture, [{id:'lyra',name:'Lyra'},{id:'orin',name:'Orin'}]);
    if (result.accepted) { this.persist(preparation); this.#preparation = preparation; }
    return result.accepted
      ? { accepted: true as const, snapshot: this.snapshot() }
      : { accepted: false as const, reason: result.reason, snapshot: this.snapshot() };
  }

  load(id: FixtureId): PublicPuzzle {
    const next=createFixture(id,`local-${this.#instance+1}`);
    next.startingState=structuredClone(next.state);next.startingWithheld=structuredClone(next.withheld);
    this.persist(next);this.#fixture=id;this.#instance++;this.#preparation=next;
    return this.snapshot();
  }
}
