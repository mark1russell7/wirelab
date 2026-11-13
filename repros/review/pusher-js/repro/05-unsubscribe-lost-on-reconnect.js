'use strict';
// The app subscribes to a channel and unsubscribes before the server confirms
// (subscriptionPending -> cancelSubscription keeps the channel in the table
// with subscriptionCancelled=true). The connection then drops before the
// confirmation. On reconnect, subscribeAll() calls channel.subscribe(), which
// clears subscriptionCancelled, so the client subscribes again to the channel
// the app left, and fires pusher:subscription_succeeded for it.
// Expected: after unsubscribe(), no new pusher:subscribe for that channel, no
// subscription_succeeded, and the channel is not in allChannels().
const { startServer, send, client, waitFor, run, shutdown } = require('./lib/harness');

run('05 unsubscribe during a pending subscription is lost after a reconnect', async () => {
  const server = await startServer({
    handlers: {
      'pusher:subscribe': (ws, msg, ctx) => {
        // first connection: never confirm; later connections: confirm
        if (ctx.index > 0) send(ws, { event: 'pusher_internal:subscription_succeeded', channel: msg.data.channel, data: '{}' });
      },
    },
  });
  const pusher = client(server.port);
  await waitFor(() => pusher.connection.state === 'connected', 5000);
  const ch = pusher.subscribe('room');
  let succeeded = 0;
  ch.bind('pusher:subscription_succeeded', () => { succeeded++; });
  await waitFor(() => server.received.some((r) => r.msg.event === 'pusher:subscribe'), 2000);
  pusher.unsubscribe('room');
  // drop the connection (abnormal close); the client reconnects after 1 s
  server.connections[0].ws.terminate();
  await waitFor(() => server.connections.length >= 2 && pusher.connection.state === 'connected', 8000);
  await waitFor(() => false, 500);
  const subsOnSecond = server.received.filter((r) => r.conn === 1 && r.msg.event === 'pusher:subscribe').map((r) => r.msg.data.channel);
  const listed = pusher.allChannels().map((c) => c.name);
  const result = {
    pass: subsOnSecond.length === 0 && succeeded === 0 && !listed.includes('room'),
    actual: `pusher:subscribe on the new connection=[${subsOnSecond}] subscription_succeeded fired=${succeeded} allChannels=[${listed}] ch.subscribed=${ch.subscribed}`,
    expected: 'no pusher:subscribe for "room" on the new connection, subscription_succeeded fired=0, allChannels=[]',
  };
  await shutdown(server, pusher);
  return result;
}, 20000);
