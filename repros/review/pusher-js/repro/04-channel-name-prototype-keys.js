'use strict';
// Channel names are valid when they use [A-Za-z0-9_\-=@,.;] (Pusher docs,
// "Channel naming conventions"). "constructor", "toString", "valueOf" and
// "hasOwnProperty" are valid names. Channels keeps its table in a plain {} and
// reads it with this.channels[name], so these names hit Object.prototype.
// Expected: subscribe() returns a Channel, sends pusher:subscribe and the
// bound callback gets the event.
const { startServer, send, client, waitFor, run, shutdown } = require('./lib/harness');

const NAMES = ['constructor', 'toString', 'valueOf', 'hasOwnProperty'];

run('04 subscribe to channel names that are Object.prototype keys', async () => {
  const uncaught = [];
  process.on('uncaughtException', (e) => uncaught.push(String(e && e.message || e)));
  const server = await startServer();
  const pusher = client(server.port);
  await waitFor(() => pusher.connection.state === 'connected', 5000);
  const rows = [];
  for (const name of NAMES) {
    let ret, threw = null, got = null;
    try {
      ret = pusher.subscribe(name);
    } catch (e) { threw = e.message; }
    if (ret && typeof ret.bind === 'function') {
      try { ret.bind('evt', (d) => { got = d; }); } catch (e) { threw = threw || e.message; }
    }
    rows.push({ name, ret, threw, get got() { return got; } });
  }
  await waitFor(() => false, 300);
  for (const n of NAMES) send(server.connections[0].ws, { event: 'evt', channel: n, data: '{"x":1}' });
  await waitFor(() => false, 300);
  const sent = server.received.filter((r) => r.msg.event === 'pusher:subscribe').map((r) => r.msg.data.channel);
  const desc = rows.map((r) => `${r.name}: returns ${r.ret && r.ret.constructor && r.ret.constructor.name === 'Channel' ? 'Channel' : (typeof r.ret === 'function' ? 'function ' + r.ret.name : String(r.ret))}${r.threw ? ' threw "' + r.threw + '"' : ''}, event delivered=${r.got !== null}`).join('; ');
  const pass = uncaught.length === 0 && rows.every((r) => !r.threw && r.got !== null) && NAMES.every((n) => sent.includes(n));
  const result = {
    pass,
    actual: `${desc}; pusher:subscribe sent for [${sent}]; uncaught on incoming events=[${uncaught}]`,
    expected: 'each name returns a Channel, pusher:subscribe is sent for each, each bound callback receives evt',
  };
  await shutdown(server, pusher);
  return result;
}, 15000);
