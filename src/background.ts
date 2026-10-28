import './security/host-guard.ts';
import OBR from '@owlbear-rodeo/sdk';
import { SharedController } from './controller/shared-controller.ts';
import { CHANNEL, parseRequest } from './transport/protocol.ts';
import { registerTokenEntry, tokenMetadata, writeTokenMetadata } from './transport/token-entry.ts';

OBR.onReady(async () => {
  await registerTokenEntry();
  if (await OBR.player.getRole() !== 'GM' || !navigator.locks) return;
  const backgroundConnection = await OBR.player.getConnectionId();
  // One listener per connection. SharedController chooses one writer for GM
  // saves, so a different GM can update an existing puzzle.
  await navigator.locks.request(`arcane-pipes:${OBR.room.id}:${backgroundConnection}`, { ifAvailable: true }, async lock => {
    if (!lock) return;
    const connection = await OBR.player.getConnectionId();
    const peers = async () => [
      ...(await OBR.party.getPlayers()).filter(p => p.connectionId !== connection),
      { id: OBR.player.id, connectionId: connection, role: await OBR.player.getRole(), name: await OBR.player.getName() },
    ];
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
        await OBR.notification.show(error instanceof Error ? error.message : 'Controller paused.', 'ERROR');
      });
    });
    await new Promise<void>(() => {});
  });
});
