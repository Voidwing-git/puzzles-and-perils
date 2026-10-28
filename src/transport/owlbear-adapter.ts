import OBR from '@owlbear-rodeo/sdk';
import { createFixture } from '../core/fixtures.ts';
import { projectPublic } from '../core/projection.ts';
import type { Command, PublicPuzzle } from '../core/state.ts';
import type { Rejection } from '../core/commands.ts';
import { CHANNEL, KEY } from './protocol.ts';
import type { Shared, Request } from './protocol.ts';
import type { FixtureId } from '../core/fixtures.ts';
import { tokenMetadata } from './token-entry.ts';
import { PlayerRehearsal } from '../controller/player-rehearsal.ts';
import { readPrivate, savePrivate, privateStorageKey } from '../core/private-store.ts';
import type { PrivatePreparation } from '../core/state.ts';
import {validatePreparation,rekeyPreparation} from '../core/save-format.ts';

export class OwlbearAdapter {
  #shared?: Shared;
  #viewer = '';
  #pending = false;
  #connection = '';
  #gm = false;
  #available = false;
  #uncertain = false;
  #ready = false;
  #listeners: (() => void)[] = [];
  #tokenId = new URLSearchParams(location.search).get('token') ?? undefined;
  #rehearsal: PlayerRehearsal | null = null;
  #previewActor = '';
  #roomPlayers: {id:string;name:string}[]=[];
  #refresh:(()=>Promise<void>)|undefined;
  get roomPlayers() {return structuredClone(this.#roomPlayers);}
  get preview() { return this.#rehearsal !== null; }
  get fixtureId(): FixtureId { return this.#shared?.fixture ?? 'relay'; }
  status = 'Connecting to Owlbear…';
  get viewer() { return this.#rehearsal ? this.#previewActor : this.#viewer; }
  get pending() { return this.#pending; }
  get gm() { return this.#gm; }
  get ready() { return this.#ready; }
  get finalized() { return !!this.#shared; }
  get privateScope() { return `${OBR.room.id}:${this.#tokenId ?? 'room'}`; }
  privatePreparation() {
    if (!this.#gm || this.preview) return null;
    let preparation:PrivatePreparation|null;
    try{const saved=readPrivate(this.privateScope);preparation=saved?validatePreparation(saved):null;}catch{return null;}
    if (!preparation || !this.#shared || preparation.state.puzzleId !== this.#shared.puzzle.puzzleId||preparation.state.revision!==this.#shared.puzzle.revision) return null;
    // Public metadata is authoritative for current rotations/inventory.
    preparation.state = structuredClone(this.#shared.puzzle);
    return preparation;
  }
  async restore(preparation:PrivatePreparation){
    const next=rekeyPreparation(validatePreparation(preparation),crypto.randomUUID());
    return this.publish(next,true);
  }
  async publish(preparation: PrivatePreparation,restoring=false) {
    if (!this.#gm || this.preview) throw new Error('Only the GM can finalize a puzzle.');
    savePrivate(`${OBR.room.id}:draft:${preparation.state.puzzleId}`, preparation);
    if (this.#shared) {
      const result = await this.request({ type: restoring?'restore-draft':'publish-draft', draftId: preparation.state.puzzleId,
        puzzleId: this.#shared.puzzle.puzzleId, expectedRevision: this.#shared.puzzle.revision });
      if (!result.accepted) throw new Error('Puzzle finalization was rejected. Reopen the current puzzle before retrying.');
      if (result.snapshot.puzzleId !== preparation.state.puzzleId ||
        JSON.stringify(result.snapshot.tiles) !== JSON.stringify(preparation.state.tiles))
        throw new Error('Saved board does not match these edits. Keep this window open and retry after reconnecting.');
      return result.snapshot;
    }
    const request: Request = { id: crypto.randomUUID(), generation: 'start', expiresAt: Date.now() + 6000,
      tokenId: this.#tokenId, command: { type: restoring?'restore-draft':'publish-draft', draftId: preparation.state.puzzleId, puzzleId: 'start', expectedRevision: 0 } };
    await OBR.broadcast.sendMessage(CHANNEL, request, { destination: 'ALL' });
    for (let i = 0; i < 25; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      this.#shared = await this.#read();
      if (this.#shared?.puzzle.puzzleId === preparation.state.puzzleId) { await this.#refresh?.();this.#notify(); return this.snapshot(); }
    }
    throw new Error('Publication unconfirmed. Reopen the window to reconcile before publishing again.');
  }
  get available() { return this.preview || this.#available; }
  snapshot() { return this.#rehearsal?.snapshot() ?? structuredClone(this.#shared?.puzzle ?? projectPublic(createFixture('relay', 'waiting'))); }
  get viewOptions() { return (this.#rehearsal?.snapshot() ?? this.snapshot()).participants; }
  setViewer(id: string) {
    if (!this.#gm) return;
    if (id === '__gm__') this.#rehearsal = null;
    else {
      this.#rehearsal ??= new PlayerRehearsal(this.snapshot(), this.fixtureId);
      this.#previewActor = id;
    }
    this.#notify();
  }
  load(): PublicPuzzle { throw new Error('Shared board replacement is unavailable in M2.'); }
  subscribe(fn: () => void) { this.#listeners.push(fn); }
  #notify() { this.#listeners.forEach(fn => fn()); }
  async #read() {
    const metadata = this.#tokenId ? await tokenMetadata(this.#tokenId, !this.#gm) : await OBR.room.getMetadata();
    const shared = metadata[KEY] as Shared | undefined;
    return shared?.tokenId === this.#tokenId ? shared : undefined;
  }
  async connect() {
    await new Promise<void>(resolve => OBR.onReady(resolve));
    this.#viewer = OBR.player.id;
    this.#connection = await OBR.player.getConnectionId();
    this.#gm = await OBR.player.getRole() === 'GM';
    this.#ready = true;
    const refresh = async () => {
      try { this.#shared = await this.#read(); }
      catch (error) {
        this.#available = false;
        this.status = error instanceof Error ? error.message : 'Puzzle unavailable.';
        this.#notify();
        return;
      }
      this.#connection = await OBR.player.getConnectionId();
      const party = await OBR.party.getPlayers();
      this.#roomPlayers=party.filter(p=>p.role==='PLAYER').filter((p,i,all)=>all.findIndex(q=>q.id===p.id)===i).map(p=>({id:p.id,name:p.name}));
      const selfRole = await OBR.player.getRole();
      this.#gm = selfRole === 'GM';
      if (!this.#gm) this.#rehearsal = null;
      const gms = party.filter(p => p.role === 'GM' && p.connectionId !== this.#connection).map(p => p.connectionId);
      if (this.#gm) gms.push(this.#connection);
      const privateReady=!this.#gm||!this.#shared||!!this.#shared.fixture||!!this.privatePreparation();
      this.#available = privateReady && !this.#uncertain && this.#shared?.version === 1 && gms.length === 1 && gms[0] === this.#shared.owner;
      this.status = this.#uncertain ? 'PAUSED: acknowledgment uncertain. Reopen the action window to reconcile.' :
        !this.#shared ? 'The GM is setting up this puzzle. Players can open it after finalization.' :
        !privateReady?'PAUSED: private preparation missing. Import a private backup from Save / recovery.':
        this.#available ? 'Owlbear shared board · controller connected' :
          gms.length > 1 ? 'Play paused: multiple GM connections. GM puzzle updates can still be saved.' :
          this.#gm ? 'Previous controller disconnected. Explicitly Save changes to reconnect this puzzle.' :
          'PAUSED: waiting for the GM to reconnect and save this puzzle.';
      this.#notify();
    };
    this.#refresh=refresh;
    if (this.#tokenId) {
      OBR.scene.items.onChange(() => { void refresh(); });
      OBR.scene.onReadyChange(() => { void refresh(); });
    } else OBR.room.onMetadataChange(() => { void refresh(); });
    OBR.party.onChange(() => { void refresh(); });
    OBR.player.onChange(() => { void refresh(); });
    // The token update can arrive before the background finishes its private
    // commit. Reconcile when that commit reaches this same-origin window.
    window.addEventListener('storage',event=>{
      if(event.key===privateStorageKey(this.privateScope))void refresh();
    });
    await refresh();
  }
  async start(fixture: FixtureId = 'relay') {
    if (!this.#gm || this.#shared) throw new Error('Only a GM can start an empty room.');
    const request = { id: crypto.randomUUID(), generation: 'start', expiresAt: Date.now() + 6000, tokenId: this.#tokenId, fixture, command: {
      type: 'advance-turn', expectedRevision: 0, puzzleId: 'start',
    } };
    for (let attempt = 0; attempt < 3; attempt++) {
      await OBR.broadcast.sendMessage(CHANNEL, request, { destination: 'ALL' });
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (await this.#read()) return;
    }
    throw new Error('No controller response. Keep exactly one GM tab open and check background/Web Locks support.');
  }
  async request(command: Command, _asHost = false) {
    if (this.#rehearsal && this.#gm) return this.#rehearsal.request(command, this.#previewActor, _asHost);
    if (this.#pending) throw new Error('Wait for the current puzzle action to finish.');
    if (this.#uncertain) throw new Error(this.status);
    // Membership/connection IDs can change while the editor is open. Read
    // them now instead of trusting the last UI notification.
    this.#shared = await this.#read();
    this.#connection = await OBR.player.getConnectionId();
    this.#gm = await OBR.player.getRole() === 'GM';
    const party = await OBR.party.getPlayers();
    const gms = party.filter(p => p.role === 'GM' && p.connectionId !== this.#connection).map(p => p.connectionId);
    if (this.#gm) gms.push(this.#connection);
    const gmSave = (command.type === 'publish-draft'||command.type==='restore-draft') && this.#gm;
    if (!gmSave && gms.length > 1) throw new Error('More than one GM connection is open. Close the extra GM room tabs before playing. GM puzzle updates can still be saved.');
    this.#available = this.#shared?.version === 1 && gms.length === 1 && gms[0] === this.#shared.owner;
    if (!this.#shared || (!this.#available && !gmSave))
      throw new Error('The original GM controller is disconnected. Open GM view and explicitly save the puzzle to reconnect. Your edits are kept privately.');
    this.#pending = true;
    const request: Request = { id: crypto.randomUUID(), generation: this.#shared.generation, expiresAt: Date.now() + 6000, tokenId: this.#tokenId, command };
    try {
      // Retry the same ID, never a fresh rotation. Durable metadata is the ack.
      for (let attempt = 0; attempt < 3; attempt++) {
        await OBR.broadcast.sendMessage(CHANNEL, request, { destination: 'ALL' });
        for (let poll = 0; poll < 10; poll++) {
          await new Promise(resolve => setTimeout(resolve, 200));
          this.#shared = await this.#read();
          const receipt = this.#shared?.receipts.find(r => r.id === request.id && r.connection === this.#connection);
          if (receipt){await this.#refresh?.();return receipt.accepted
            ? { accepted: true as const, snapshot: this.snapshot() }
            : { accepted: false as const, snapshot: this.snapshot(), reason: receipt.reason as Rejection };}
        }
      }
      this.#available = false;
      this.#uncertain = true;
      this.status = 'PAUSED: acknowledgment uncertain. Reopen the action window to reconcile before another move.';
      throw new Error(this.status);
    } catch (error) {
      this.#uncertain = true;
      this.#available = false;
      this.status = 'PAUSED: request outcome uncertain. Reopen the action window to reconcile.';
      throw error;
    } finally { this.#pending = false; this.#notify(); }
  }
}
