import { LocalController } from '../controller/local-controller.ts';
import type { FixtureId } from '../core/fixtures.ts';
import type { Command, PublicPuzzle } from '../core/state.ts';
import type { PrivatePreparation } from '../core/state.ts';
import { savePrivate,readPrivate } from '../core/private-store.ts';
import {createFixture} from '../core/fixtures.ts';

export class LocalAdapter {
  #controller:LocalController;
  recoveryError='';
  constructor(){
    const persist=(p:PrivatePreparation)=>{if(typeof window!=='undefined')savePrivate('local:active',p);};
    try{this.#controller=new LocalController(persist,typeof window==='undefined'?undefined:readPrivate('local:active')??undefined);}
    catch{this.recoveryError='Local save unavailable or damaged. Import a private backup or explicitly create a new puzzle.';const fallback=createFixture('relay','recovery-required');fallback.state.paused=true;fallback.state.title='Recovery required';this.#controller=new LocalController(persist,fallback);}
  }
  #viewer = 'lyra';
  #pending = false;
  snapshot(): PublicPuzzle { return this.#controller.snapshot(); }
  get roomPlayers() { return [{id:'lyra',name:'Lyra'},{id:'orin',name:'Orin'}]; }
  get viewer() { return this.#viewer; }
  get pending() { return this.#pending; }
  setViewer(id: string) { this.#viewer = id; }
  load(id: FixtureId) { const next=this.#controller.load(id);this.recoveryError='';return next; }
  privatePreparation() { return this.recoveryError?null:this.#controller.privatePreparation(); }
  publish(preparation: PrivatePreparation) { const next=this.#controller.publish(preparation);this.recoveryError='';return next; }
  restore(preparation:PrivatePreparation){const next=this.#controller.restore(preparation);this.recoveryError='';return next;}
  async request(command: Command, asHost = false) {
    if(this.recoveryError)throw new Error(this.recoveryError);
    if (this.#pending) throw new Error('A local action is already pending.');
    this.#pending = true;
    const actor = asHost ? { id: 'demo-host', role: 'GM' as const } : { id: this.#viewer, role: 'PLAYER' as const };
    try {
      // Preserve a visible request/acknowledgment boundary for later transports.
      await new Promise((resolve) => setTimeout(resolve, 90));
      return this.#controller.submit(command, actor);
    } finally { this.#pending = false; }
  }
}
