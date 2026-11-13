'use strict';
// The protocol makes the code of pusher:error optional ("code: Integer -
// optional"). When the first frame is a pusher:error with "code": null, the
// handshake action is null and ConnectionManager calls
// handshakeCallbacks[null] -> TypeError. In Node.js the TypeError escapes the
// WebSocket message handler as an uncaught exception.
// Expected: an 'error' event and a retry (or a clean, reported failure),
// never an uncaught exception.
const { startServer, send, client, waitFor, run, shutdown } = require('./lib/harness');

const CODE = process.argv[2] === 'missing' ? undefined : null;

run(`02 handshake pusher:error with code=${CODE === null ? 'null' : 'missing'}`, async () => {
  const uncaught = [];
  process.on('uncaughtException', (e) => uncaught.push(String(e && e.message || e)));
  const server = await startServer({
    autoEstablish: false,
    onConnection: (ws, ctx) => {
      if (ctx.index === 0) {
        const data = { message: 'Something went wrong' };
        if (CODE === null) data.code = null;
        send(ws, { event: 'pusher:error', data });
      } else {
        send(ws, { event: 'pusher:connection_established', data: JSON.stringify({ socket_id: ctx.socketId, activity_timeout: 120 }) });
      }
    },
  });
  const pusher = client(server.port, { unavailableTimeout: 2000 });
  const states = [];
  pusher.connection.bind('state_change', (s) => states.push(s.current));
  const ok = await waitFor(() => pusher.connection.state === 'connected', 20000, 50);
  const result = {
    pass: ok && uncaught.length === 0,
    actual: `state=${pusher.connection.state} serverConnections=${server.connections.length} states=[${states}] uncaught=[${uncaught}]`,
    expected: 'no uncaught exception; the client retries and reaches state=connected within 20 s',
  };
  await shutdown(server, pusher);
  return result;
}, 30000);
