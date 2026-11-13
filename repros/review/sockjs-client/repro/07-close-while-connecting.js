'use strict';
// close() while CONNECTING. WHATWG WebSockets close(): "If the WebSocket connection is not yet
// established: Fail the WebSocket connection and set ready state to CLOSING." Failing fires an
// error event, then a close event with wasClean false and code 1006.
// sockjs-client (lib/main.js:134-152, 331-367) instead closes with code 1000 and wasClean true, and
// fires the error event only while the /info request is pending (forceFail = !!this._ir), not
// while the transport connects. So the events depend on an internal phase the caller cannot see.
// Control: the native WebSocket of Node 24, close() before the handshake ends.
const { req, timeLimit, verdict, rawServer, sleep } = require('./lib');
timeLimit(20000, '07-close-while-connecting');
const SockJS = req('sockjs-client');

function record(s) {
  const ev = [];
  s.onerror = () => ev.push('error');
  s.onclose = (e) => ev.push(`close code=${e.code} clean=${e.wasClean}`);
  return ev;
}

(async () => {
  let streamingSeen = false;
  const srv = await rawServer((r, res) => {
    if (r.url.startsWith('/echo/info')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ websocket: false, cookie_needed: false, origins: ['*:*'], entropy: 1 }));
    } else if (r.url.includes('/xhr_streaming')) {
      streamingSeen = true;
      res.writeHead(200, { 'Content-Type': 'application/javascript' }); // never sends the 'o' frame
    } else { res.writeHead(404); res.end(); }
  }, (r, socket) => { /* never finish a websocket handshake */ });
  const url = `http://127.0.0.1:${srv.port}/echo`;

  // Phase 1: close() while /info is pending.
  const s1 = new SockJS(url, null, { transports: ['xhr-streaming'] });
  const ev1 = record(s1);
  s1.close();
  await sleep(100);

  // Phase 2: close() after /info, while the transport connects.
  const s2 = new SockJS(url, null, { transports: ['xhr-streaming'], timeout: 5000 });
  const ev2 = record(s2);
  for (let i = 0; i < 50 && !streamingSeen; i++) await sleep(20);
  const rs2 = s2.readyState;
  s2.close();
  await sleep(100);

  // Control: native WebSocket.
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/raw`);
  const evN = [];
  ws.onerror = () => evN.push('error');
  ws.onclose = (e) => evN.push(`close code=${e.code} clean=${e.wasClean}`);
  ws.close();
  await sleep(200);

  const want = ['error', 'close code=1006 clean=false'];
  const actual = { infoPhase: ev1, transportPhase: ev2, transportPhaseReadyStateBeforeClose: rs2, nativeWebSocket: evN };
  const ok = verdict('close() while CONNECTING fails the connection the same way in each phase',
    JSON.stringify(ev1) === JSON.stringify(want) && JSON.stringify(ev2) === JSON.stringify(want),
    actual, { infoPhase: want, transportPhase: want, transportPhaseReadyStateBeforeClose: 0, nativeWebSocket: want });
  await srv.close();
  process.exit(ok ? 0 : 1);
})();
