import './security/host-guard.ts';
import OBR from '@owlbear-rodeo/sdk';
import { SharedController } from './controller/shared-controller.ts';
import { CHANNEL, STATUS_CHANNEL, parseRequest } from './transport/protocol.ts';
import { registerTokenEntry, tokenMetadata, writeTokenMetadata } from './transport/token-entry.ts';

OBR.onReady(async () => {
  // Entry registration must not prevent an existing puzzle's controller from
  // starting if an unrelated tool/context-menu registration fails.
  void registerTokenEntry().catch(()=>OBR.notification.show('Puzzle entry controls could not load. Reload the Owlbear room.','ERROR'));
  if (await OBR.player.getRole() !== 'GM' || !navigator.locks) return;
  const backgroundConnection = await OBR.player.getConnectionId();
  // One listener per connection. SharedController chooses one writer for GM
  // saves, so a different GM can update an existing puzzle.
  await navigator.locks.request(`arcane-pipes:${OBR.room.id}:${backgroundConnection}`, { ifAvailable: true }, async lock => {
    if (!lock) return;
    const connection = await OBR.player.getConnectionId();
    const peers = async () => {
      const [players,role,name]=await Promise.all([OBR.party.getPlayers(),OBR.player.getRole(),OBR.player.getName()]);
      return [...players.filter(p=>p.connectionId!==connection),{id:OBR.player.id,connectionId:connection,role,name}];
    };
    const controller = new SharedController(connection, {
      peers,
      read: () => OBR.room.getMetadata(),
      write: update => OBR.room.setMetadata(update),
    }, undefined, OBR.room.id);
    const tokenControllers = new Map<string, SharedController>();
    OBR.scene.onReadyChange(() => tokenControllers.clear());
    OBR.broadcast.onMessage(CHANNEL, event => {
      const request = parseRequest(event.data);
      if (!request) return;
      if(request.expiresAt<=Date.now()||request.expiresAt>Date.now()+10000){
        void OBR.broadcast.sendMessage(STATUS_CHANNEL,{id:request.id,tokenId:request.tokenId,message:'Request timing differs from the GM controller. Enable automatic date/time on both devices, then reopen the puzzle.',uncertain:false},{destination:'ALL'});
        return;
      }
      let target = controller;
      if (request.tokenId) {
        const tokenId = request.tokenId;
        if (!tokenControllers.has(tokenId)) tokenControllers.set(tokenId, new SharedController(connection, {
          peers,
          read: () => tokenMetadata(tokenId, false),
          write: update => writeTokenMetadata(tokenId, update),
        }, tokenId, OBR.room.id));
        target = tokenControllers.get(tokenId)!;
      }
      void target.submit(event.data, event.connectionId).catch(async error => {
        // Only fixed application messages are sent; no private preparation or
        // arbitrary exception details belong on the shared broadcast channel.
        const message=controllerFailure(error);
        await OBR.broadcast.sendMessage(STATUS_CHANNEL,{id:request.id,tokenId:request.tokenId,message,uncertain:target.uncertain},{destination:'ALL'});
        await OBR.notification.show(error instanceof Error ? error.message : 'Controller paused.', 'ERROR');
      });
    });
    await new Promise<void>(() => {});
  });
});

function controllerFailure(error:unknown){
  const message=error instanceof Error?error.message:'';
  if(message.includes('metadata is full'))return 'Puzzle storage is full. The GM must free metadata space before another move.';
  if(message.includes('Private/public puzzle mismatch'))return 'The GM controller has mismatched puzzle saves. The GM must use Save / recovery.';
  if(message.includes('Private puzzle unavailable'))return 'The GM controller cannot find this puzzle’s private save. Open the original GM browser or restore a private backup.';
  if(message.includes('private backup')||message.includes('save outcome'))return 'Controller recovery is unresolved. The GM must use Save / recovery.';
  if(message.includes('Private')||message.includes('Invalid or unsupported'))return 'The GM controller could not read or save this puzzle. The GM must check Save / recovery.';
  return 'The GM controller could not confirm the save. The GM must reload the Owlbear room, then reopen the puzzle.';
}
