'use strict';
// lib/main.js:136 tests `if (code && !userSetCode(code))`, so a present but falsy code (0, NaN)
// skips the check, and line 151 replaces it with 1000.
// WHATWG WebSockets, close(code, reason): "If code is present, but is neither an integer equal to
// 1000 nor an integer in the range 3000 to 4999, inclusive, throw an InvalidAccessError
// DOMException." code is `[Clamp] unsigned short`, so 0 and NaN are both the integer 0.
// The README: "The API should follow HTML5 Websockets API as closely as possible."
// Control: the native WebSocket of Node 24 throws for close(0).
const { req, timeLimit, verdict, sockjsServer } = require('./lib');
timeLimit(20000, '05-close-code-zero');
const SockJS = req('sockjs-client');

function attempt(sock, code) {
  try { sock.close(code); return 'no throw, readyState ' + sock.readyState; } catch (e) { return 'throws ' + e.message; }
}

(async () => {
  const srv = await sockjsServer();
  const results = {};
  for (const code of [0, NaN]) {
    await new Promise((resolve) => {
      const s = new SockJS(srv.url, null, { transports: ['websocket'] });
      s.onopen = () => { results[String(code)] = attempt(s, code); if (s.readyState === 1) s.close(); };
      s.onclose = (e) => { results[String(code)] += ', close event code ' + e.code; resolve(); };
    });
  }
  // Control: native WebSocket against the raw sockjs websocket URL.
  const wsUrl = srv.url.replace('http', 'ws') + '/websocket';
  const native = await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => { const r = attempt(ws, 0); ws.close(); resolve(r); };
    ws.onerror = () => resolve('native ws error');
  });
  const ok = verdict('close(0) and close(NaN) throw InvalidAccessError',
    /InvalidAccessError/.test(results['0']) && /InvalidAccessError/.test(results['NaN']),
    { sockjs: results, nativeWebSocketClose0: native },
    { sockjs: { 0: 'throws InvalidAccessError: Invalid code', NaN: 'throws InvalidAccessError: Invalid code' }, nativeWebSocketClose0: 'throws (InvalidAccessError)' });
  await srv.close();
  process.exit(ok ? 0 : 1);
})();
