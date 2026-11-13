'use strict';
// lib/main.js:216 arms a new _transportTimeoutId for each transport attempt, but
// _transportClose() (297-311) does not clear the timer of the attempt that just failed. When the
// first transport fails fast, its timer still fires during the next attempt and kills it
// (lib/main.js:233-242), so the fallback transport gets less than its own timeout.
// Here: websocket fails after 400 ms; xhr-polling answers 'o' 300 ms after its request, inside
// its own timeout (about 2 x RTO = 610 ms) but after the websocket timer (about 610 ms from t0).
// Usage: node repro/09-stale-transport-timer.js [main]   ("main" runs the source of the main branch)
const path = require('path');
const { req, timeLimit, verdict, rawServer, sleep, ROOT } = require('./lib');
timeLimit(20000, '09-stale-transport-timer');
const useMain = process.argv[2] === 'main';
const SockJS = useMain ? require(path.join(ROOT, 'src-main', 'lib', 'entry.js')) : req('sockjs-client');

(async () => {
  const t0 = Date.now();
  const log = [];
  const srv = await rawServer((r, res) => {
    log.push(`${Date.now() - t0}ms ${r.method} ${r.url.replace(/\?.*/, '')}`);
    if (r.url.startsWith('/echo/info')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ websocket: true, cookie_needed: false, origins: ['*:*'], entropy: 1 }));
    } else if (/\/xhr$/.test(r.url.replace(/\?.*/, ''))) {
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.end('o\n'); }, 300);
    } else { res.writeHead(404); res.end(); }
  }, (r, socket) => {
    log.push(`${Date.now() - t0}ms UPGRADE ${r.url}`);
    setTimeout(() => socket.destroy(), 400); // the websocket attempt fails after 400 ms
  });
  const result = await new Promise((resolve) => {
    const s = new SockJS(`http://127.0.0.1:${srv.port}/echo`, null, { transports: ['websocket', 'xhr-polling'] });
    s.onopen = () => { const t = s.transport; s.close(); resolve(`open via ${t} at ${Date.now() - t0}ms`); };
    s.onclose = (e) => resolve(`close ${e.code} "${e.reason}" at ${Date.now() - t0}ms`);
  });
  await sleep(50);
  const ok = verdict(`fallback transport gets its own full timeout (${useMain ? 'main branch' : '1.6.1'})`,
    /^open via xhr-polling/.test(result), { result, server: log }, 'open via xhr-polling');
  await srv.close();
  process.exit(ok ? 0 : 1);
})();
