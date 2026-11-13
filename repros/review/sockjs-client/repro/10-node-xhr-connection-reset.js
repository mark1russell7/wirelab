'use strict';
// The Node.js XHR driver (lib/transport/driver/xhr.js:30-49) listens only for res 'data' and
// 'end' and req 'error'. When the connection drops in the middle of a response (server crash,
// proxy reset), Node emits res 'aborted'/'close' and not 'end', and no req 'error' (the response
// had started). So 'finish' is never emitted, the receiver never closes, and the SockJS socket
// stays OPEN with no close event, forever. The websocket transport reports the same drop as
// close 1006 at once (control).
// The server here is a real sockjs-node server; the "crash" destroys its TCP sockets after open.
const { req, timeLimit, verdict, sockjsServer, sleep } = require('./lib');
timeLimit(30000, '10-node-xhr-connection-reset');
const SockJS = req('sockjs-client');

async function trial(transport) {
  const srv = await sockjsServer();
  const s = new SockJS(srv.url, null, { transports: [transport] });
  await new Promise((r) => { s.onopen = r; });
  const events = [];
  s.onclose = (e) => events.push(`close ${e.code}`);
  // Give xhr-polling time to start its next long poll, then drop every server connection.
  await sleep(300);
  await srv.crash();
  await sleep(3000);
  const out = { readyState: s.readyState, events };
  try { if (s.readyState === 1) s.close(); } catch (e) { /* ignore */ }
  return out;
}

(async () => {
  const actual = {};
  for (const t of ['websocket', 'xhr-streaming', 'xhr-polling']) actual[t] = await trial(t);
  const want = { readyState: 3, events: ['close 1006'] };
  const ok = verdict('a dropped connection gives a close event within 3 s on every transport',
    ['xhr-streaming', 'xhr-polling'].every((t) => actual[t].readyState === 3 && actual[t].events.length === 1),
    actual, { websocket: want, 'xhr-streaming': want, 'xhr-polling': want });
  process.exit(ok ? 0 : 1);
})();
