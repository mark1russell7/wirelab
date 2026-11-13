'use strict';
// ConnectionManager.retryIn() overwrites this.retryTimer without aborting the
// timer that is already pending. After an unexpected close the manager
// schedules retryIn(1000). If the app then calls switchCluster() (or
// connect()) during that second, a new connection is made at once, and the
// old 1 s timer still fires: disconnectInternally() closes the new, healthy
// connection and the client connects a third time.
// Expected: 2 server connections in all (the dropped one and its
// replacement); the replacement stays open.
const { startServer, client, waitFor, sleep, run, shutdown } = require('./lib/harness');

const MODE = process.argv[2] || 'switchCluster';

run(`08 stale retry timer closes a healthy connection (${MODE})`, async () => {
  const server = await startServer();
  const pusher = client(server.port);
  await waitFor(() => pusher.connection.state === 'connected', 5000);
  const states = [];
  pusher.connection.bind('state_change', (s) => states.push(`${s.previous}->${s.current}`));
  const closedByClient = [];
  server.connections[0].ws.terminate(); // unexpected drop -> retryIn(1000)
  // wait until the client has seen the close (state is still "connected")
  await waitFor(() => pusher.connection.connection === null, 1000, 2);
  if (MODE === 'switchCluster') pusher.switchCluster({ appKey: 'app-key', cluster: 'eu' });
  else pusher.connect();
  await waitFor(() => server.connections.length >= 2 && pusher.connection.state === 'connected', 3000);
  const second = server.connections[1] && server.connections[1].ws;
  if (second) second.on('close', (code) => closedByClient.push(code));
  await sleep(2500);
  const result = {
    pass: server.connections.length === 2 && closedByClient.length === 0,
    actual: `serverConnections=${server.connections.length} replacementClosed=${closedByClient.length ? 'yes (code ' + closedByClient[0] + ')' : 'no'} states=[${states}]`,
    expected: 'serverConnections=2, the replacement connection is not closed',
  };
  await shutdown(server, pusher);
  return result;
}, 15000);
