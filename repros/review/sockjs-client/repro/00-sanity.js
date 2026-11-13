'use strict';
// Sanity: each transport that Node.js can run opens, echoes (with odd characters), and closes cleanly
// against a real sockjs-node 0.3.24 server. Also records the order of readyState and events.
const { req, timeLimit, verdict, sockjsServer } = require('./lib');
timeLimit(30000, '00-sanity');
const SockJS = req('sockjs-client');

const MSG = 'hi   % %25 \n\r\u0000 "q" \\ 😀 é';

function run(url, transport) {
  return new Promise((resolve) => {
    const log = [];
    const s = new SockJS(url, null, { transports: [transport] });
    log.push('rs=' + s.readyState);
    s.onopen = () => { log.push('open rs=' + s.readyState + ' t=' + s.transport); s.send(MSG); };
    s.onmessage = (e) => { log.push('msg ok=' + (e.data === MSG)); s.close(3001, 'bye'); log.push('after close rs=' + s.readyState); };
    s.onerror = () => log.push('error');
    s.onclose = (e) => { log.push(`close rs=${s.readyState} code=${e.code} reason=${e.reason} clean=${e.wasClean}`); resolve(log); };
  });
}

(async () => {
  const srv = await sockjsServer();
  let ok = true;
  for (const t of ['websocket', 'xhr-streaming', 'xhr-polling', 'eventsource']) {
    const log = await run(srv.url, t);
    const exp = ['rs=0', `open rs=1 t=${t}`, 'msg ok=true', 'after close rs=2', 'close rs=3 code=3001 reason=bye clean=true'];
    ok = verdict('transport ' + t, JSON.stringify(log) === JSON.stringify(exp), log, exp) && ok;
  }
  await srv.close();
  process.exit(ok ? 0 : 1);
})();
