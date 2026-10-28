import { createFixture } from '../core/fixtures.ts';
import { projectPublic } from '../core/projection.ts';
import { assertFits, KEY, parseRequest } from '../transport/protocol.ts';
import type { Shared } from '../transport/protocol.ts';
import { readPrivate, savePrivate,discardPrivate } from '../core/private-store.ts';
import { applyAdventure } from '../core/adventure.ts';
import {validatePreparation} from '../core/save-format.ts';


export interface Peer { id: string; connectionId: string; role: 'GM' | 'PLAYER'; name: string }
export interface RoomIO {
  peers(): Promise<Peer[]>;
  read(): Promise<Record<string, unknown>>;
  write(update: Record<string, unknown>): Promise<void>;
}
export class SharedController {
  #queue = Promise.resolve();
  #uncertain = false;
  private connection: string;
  private io: RoomIO;
  private tokenId?: string;
  private scope: string;
  constructor(connection: string, io: RoomIO, tokenId?: string, scope = 'room') { this.connection = connection; this.io = io; this.tokenId = tokenId; this.scope = scope; }
  get uncertain() { return this.#uncertain; }
  submit(data: unknown, sender: string): Promise<void> {
    const job = this.#queue.then(() => this.#handle(data, sender));
    this.#queue = job.catch(() => {});
    return job;
  }
  async #handle(data: unknown, sender: string) {
      const request = parseRequest(data);
      if (!request || (this.#uncertain&&request.command.type!=='restore-draft')) return;
      if (request.tokenId !== this.tokenId) return;
      if (request.expiresAt <= Date.now() || request.expiresAt > Date.now() + 10000) return;
      const peers = await this.io.peers();
      const gms = peers.filter(p => p.role === 'GM');
      const actor = peers.find(p => p.connectionId === sender);
      if (!actor) return;
      const metadata = await this.io.read();
      let shared = metadata[KEY] as Shared | undefined;
      // Duplicating a scene token must create a new puzzle instance when started.
      if (shared?.tokenId !== this.tokenId) shared = undefined;
      const publishing = request.command.type === 'publish-draft'||request.command.type==='restore-draft';
      // The editing GM's background publishes its local private draft. Other
      // backgrounds ignore that save, irrespective of who created the puzzle.
      const publisher = (list: Peer[]) => list.find(p => p.connectionId === sender);
      if (publishing ? publisher(gms)?.connectionId !== this.connection :
        gms.length !== 1 || gms[0].connectionId !== this.connection) return;
      const roster = peers.filter(p => p.role === 'PLAYER')
        .filter((p, i, all) => all.findIndex(q => q.id === p.id) === i)
        .map(p => ({ id: p.id, name: p.name }));
      if (!roster.length) roster.push({ id: actor.id, name: `${actor.name} (solo GM seat)` });
      // Explicit start from the GM action window; fixed board, current party order.
      const privateKey = `${this.scope}:${this.tokenId ?? 'room'}`;
      let pendingPrivate: import('../core/state.ts').PrivatePreparation | undefined;
      if (request.command.type === 'publish-draft'||request.command.type==='restore-draft') {
        if (actor.role !== 'GM') return;
        if (shared && (request.generation !== shared.generation ||
          request.command.puzzleId !== shared.puzzle.puzzleId || request.command.expectedRevision !== shared.puzzle.revision)) return;
        if (!shared && request.generation !== 'start') return;
        const savedDraft = readPrivate(`${this.scope}:draft:${request.command.draftId}`);
        if (!savedDraft) throw new Error('Private puzzle settings unavailable in controller storage. Export them and use the same browser/origin.');
        const restoring=request.command.type==='restore-draft';
        const draft=restoring?validatePreparation(savedDraft):savedDraft;
        const activePlayer=draft.state.participants[draft.state.activeIndex]?.id;
        if(shared?.puzzle.rosterCustomized && draft.state.rosterCustomized) {
          const known=new Map([...shared.puzzle.participants,...roster].map(p=>[p.id,p]));
          const selected=draft.state.participants.map(p=>known.get(p.id)).filter(p=>!!p);
          draft.state.participants=selected.length?selected:roster;
          draft.state.activeIndex=Math.min(draft.state.activeIndex,draft.state.participants.length-1);
        } else draft.state.participants = roster;
        draft.state.activeIndex=restoring?Math.max(0,draft.state.participants.findIndex(p=>p.id===activePlayer)):Math.min(draft.state.activeIndex,draft.state.participants.length-1);
        draft.state.puzzleId = request.command.draftId;
        if(restoring){draft.startingState??=structuredClone(draft.state);draft.startingState.puzzleId=draft.state.puzzleId;draft.startingWithheld??=structuredClone(draft.withheld);}
        else {draft.startingState = structuredClone(draft.state);draft.startingWithheld = structuredClone(draft.withheld);draft.history=[];draft.actionHistory=[];}
        pendingPrivate = draft;
        shared = { version: 1, owner: this.connection, generation: crypto.randomUUID(), puzzle: projectPublic(draft),
          receipts: [{ id: request.id, connection: sender, revision: draft.state.revision, accepted: true }],
          ...(this.tokenId ? { tokenId: this.tokenId } : {}) };
      } else if (!shared) {
        if (actor.role !== 'GM' || request.generation !== 'start') return;
        const preparation = createFixture(request.fixture ?? 'relay', crypto.randomUUID());
        preparation.state.participants = roster;
        preparation.startingState = structuredClone(preparation.state);
        pendingPrivate = preparation;
        shared = { version: 1, owner: this.connection, generation: crypto.randomUUID(), puzzle: projectPublic(preparation), receipts: [], fixture: request.fixture ?? 'relay', ...(this.tokenId ? { tokenId: this.tokenId } : {}) };
      } else {
        if (shared.version !== 1 || shared.owner !== this.connection || request.generation !== shared.generation) return;
        if (shared.receipts.some(r => r.id === request.id && r.connection === sender)) return;
        const identity = { id: actor.id, role: actor.role };
        const rawSaved = typeof localStorage === 'undefined' ? null : readPrivate(privateKey);
        const saved=rawSaved?validatePreparation(rawSaved):null;
        if (saved && (saved.state.puzzleId !== shared.puzzle.puzzleId||saved.state.revision!==shared.puzzle.revision)) throw new Error('Private/public puzzle mismatch. Controller paused. Import a private backup to recover.');
        if (!saved && !shared.fixture) throw new Error('Private puzzle unavailable. Keep the original GM browser open.');
        const preparation = saved ?? createFixture(shared.fixture ?? 'relay', shared.puzzle.puzzleId);
        preparation.startingState ??= structuredClone(preparation.state);
        preparation.state = shared.puzzle;
        const transition = applyAdventure(preparation, request.command, identity, shared.fixture ?? 'relay', roster);
        const result = transition.result;
        if (result.accepted) pendingPrivate = transition.preparation;
        const puzzle = result.accepted ? projectPublic(transition.preparation) : shared.puzzle;
        shared = { ...shared, puzzle, receipts: [...shared.receipts.slice(-23), {
          id: request.id, connection: sender, revision: puzzle.revision, accepted: result.accepted,
          ...(!result.accepted ? { reason: result.reason } : {}),
        }] };
        if (result.accepted && ['reset-puzzle', 'sync-players','undo'].includes(request.command.type)) shared.generation = crypto.randomUUID();
      }
      assertFits(metadata, shared);
      // Membership may change while awaiting metadata. Revalidate the sole GM
      // and authenticated sender before committing a result derived above.
      const currentPeers = await this.io.peers();
      const currentGms = currentPeers.filter(p => p.role === 'GM');
      const currentActor = currentPeers.find(p => p.connectionId === sender);
      if ((publishing ? publisher(currentGms)?.connectionId !== this.connection : currentGms.length !== 1 || currentGms[0].connectionId !== this.connection) ||
        !currentActor || currentActor.id !== actor.id || currentActor.role !== actor.role) return;
      // A request may expire while waiting on party/metadata IO. Never commit
      // a queued request after its deadline, even when the revision still matches.
      if (request.expiresAt <= Date.now()) return;
      // Stage a new version before publishing; retain the previous committed save
      // until metadata succeeds. An uncertain write pauses this controller.
      if (pendingPrivate && typeof localStorage !== 'undefined') savePrivate(`${privateKey}:staged`, pendingPrivate);
      try { await this.io.write({ [KEY]: shared }); }
      catch (error) { this.#uncertain = true; throw error; }
      if (pendingPrivate && typeof localStorage !== 'undefined') {
        try { savePrivate(privateKey, pendingPrivate); }
        catch (error) { this.#uncertain = true; throw error; }
        discardPrivate(`${privateKey}:staged`);
        if(request.command.type==='publish-draft'||request.command.type==='restore-draft')discardPrivate(`${this.scope}:draft:${request.command.draftId}`);
        this.#uncertain=false;
      }
  }
}
