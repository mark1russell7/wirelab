'use strict';
// Dispatcher.emit passes `data` to callbacks only when it is truthy
// (`else if (data) args.push(data)`). Event data that decodes to 0, false,
// null or "" reaches a pusher.bind() (global) callback as `undefined`,
// while channel.bind() gets the real value. The same emit path serves
// pusher.user.bind() and encrypted channels.
// Expected: both callbacks get the decoded data (0, false, null, "").
const { startServer, send, client, waitFor, run, shutdown } = require('./lib/harness');

const PAYLOADS = ['0', 'false', 'null', ''];

run('06 falsy event data reaches pusher.bind() callbacks as undefined', async () => {
  const server = await startServer();
  const pusher = client(server.port);
  await waitFor(() => pusher.connection.state === 'connected', 5000);
  const ch = pusher.subscribe('room');
  await waitFor(() => ch.subscribed, 3000);
  const viaGlobal = [];
  const viaChannel = [];
  pusher.bind('evt', function () { viaGlobal.push(arguments.length ? JSON.stringify(arguments[0]) : '(no argument)'); });
  ch.bind('evt', function (d) { viaChannel.push(JSON.stringify(d)); });
  for (const p of PAYLOADS) send(server.connections[0].ws, { event: 'evt', channel: 'room', data: p });
  await waitFor(() => viaGlobal.length === PAYLOADS.length && viaChannel.length === PAYLOADS.length, 3000);
  const same = viaGlobal.every((v, i) => v === viaChannel[i]);
  const result = {
    pass: same && viaGlobal.length === PAYLOADS.length,
    actual: `channel.bind got [${viaChannel.join(', ')}]; pusher.bind got [${viaGlobal.join(', ')}]`,
    expected: 'pusher.bind gets the same values as channel.bind: [0, false, null, ""]',
  };
  await shutdown(server, pusher);
  return result;
}, 15000);
