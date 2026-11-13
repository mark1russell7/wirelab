'use strict';
// lib/main.js:216 arms _transportTimeoutId when a transport starts. _open() (313-329) clears it,
// but on close() while the transport connects, _close() (331-367) never clears the timer, so it
// stays armed for the full transport timeout
// (options.timeout, or rto x roundTrips, default floor 5 s) after the close event. In Node.js it
// keeps the process alive: a CLI or a test that closes its socket and its server cannot exit.
// The child below closes the socket while xhr-streaming waits for 'o', then closes its server and
// does nothing else. The parent measures how long the child takes to exit by itself.
const path = require('path');
const { spawn } = require('child_process');

if (process.argv[2] === 'child') {
  const { req, rawServer } = require('./lib');
  const SockJS = req('sockjs-client');
  (async () => {
    let streaming;
    const seen = new Promise((r) => { streaming = r; });
    const srv = await rawServer((r, res) => {
      if (r.url.startsWith('/echo/info')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ websocket: false, cookie_needed: false, origins: ['*:*'], entropy: 1 }));
      } else if (r.url.includes('/xhr_streaming')) {
        res.writeHead(200, { 'Content-Type': 'application/javascript' }); // no 'o' frame yet
        streaming();
      } else { res.writeHead(404); res.end(); }
    });
    const s = new SockJS(`http://127.0.0.1:${srv.port}/echo`, null, { transports: ['xhr-streaming'], timeout: 8000 });
    await seen;
    s.onclose = async (e) => {
      await srv.close();
      console.log(`child: close event code=${e.code}; active after close: ${JSON.stringify(process.getActiveResourcesInfo())}`);
    };
    s.close();
  })();
  return;
}

const { verdict, timeLimit } = require('./lib');
timeLimit(20000, '11-transport-timer-after-close');
const t0 = Date.now();
const child = spawn(process.execPath, [__filename, 'child'], { stdio: ['ignore', 'pipe', 'inherit'] });
let out = '';
child.stdout.on('data', (d) => { out += d; });
child.on('exit', (code) => {
  const ms = Date.now() - t0;
  process.stdout.write(out);
  const ok = verdict('the process exits soon after close() and server.close()',
    ms < 3000, `child exit after ${ms} ms (code ${code})`, 'child exit within 3000 ms (no timer left)');
  process.exit(ok ? 0 : 1);
});
