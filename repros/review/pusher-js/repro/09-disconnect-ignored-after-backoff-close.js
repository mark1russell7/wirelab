'use strict';
// When the server closes the connection with a "backoff" code (4100-4199, or
// 1002-1004), Connection emits 'backoff' -> retryIn(1000) (timer A) and then
// 'closed' -> retryIn(1000) (timer B). retryIn overwrites this.retryTimer, so
// only B is kept. If the app calls pusher.disconnect() during that second,
// clearRetryTimer() aborts B only; A fires, and the client connects again
// although the app asked to disconnect.
// Expected (doc comment of ConnectionManager: "disconnected - on requested
// disconnection"; README: disconnect() closes the connection): the state
// stays "disconnected" and no new connection is made.
const { startServer, client, waitFor, sleep, run, shutdown } = require('./lib/harness');

const CODE = Number(process.argv[2] || 4100);

run(`09 disconnect() after a close with code ${CODE} is ignored`, async () => {
  const server = await startServer();
  const pusher = client(server.port);
  await waitFor(() => pusher.connection.state === 'connected', 5000);
  const states = [];
  pusher.connection.bind('state_change', (s) => states.push(s.current));
  server.connections[0].ws.close(CODE, 'Over capacity');
  await waitFor(() => pusher.connection.connection === null, 2000, 2);
  await sleep(100);
  pusher.disconnect();
  await sleep(2500);
  const result = {
    pass: pusher.connection.state === 'disconnected' && server.connections.length === 1,
    actual: `state=${pusher.connection.state} serverConnections=${server.connections.length} states after close=[${states}]`,
    expected: 'state=disconnected, serverConnections=1 (no reconnect after disconnect())',
  };
  await shutdown(server, pusher);
  return result;
}, 15000);
