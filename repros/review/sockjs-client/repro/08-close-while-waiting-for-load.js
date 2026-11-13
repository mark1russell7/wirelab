'use strict';
// lib/main.js:202-211: a transport with needBody (xhr-streaming, the iframe-* transports,
// jsonp-polling) waits for window 'load' with attachEvent('load', this._connect.bind(this)).
// close() (lib/main.js:331-367) neither removes that listener nor empties this._transports, so on
// 'load' the closed socket still runs _connect(): it opens a transport, the server answers 'o',
// _open() sees readyState CLOSED and calls _close(), which throws
// "InvalidStateError: SockJS has already been closed" from inside the transport callback.
// Browser globals are stood in here: a document whose body is not ready, and a window
// addEventListener that keeps the 'load' listeners so the script can fire 'load'.
const { req, timeLimit, verdict, sockjsServer, sleep } = require('./lib');
timeLimit(20000, '08-close-while-waiting-for-load');

const listeners = {};
global.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
global.removeEventListener = (type, fn) => {
  listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
};
global.document = { body: null, readyState: 'loading', domain: 'localhost' };
const SockJS = req('sockjs-client');

(async () => {
  const srv = await sockjsServer();
  const thrown = [];
  process.on('uncaughtException', (e) => thrown.push(e.message));
  const events = [];
  const s = new SockJS(srv.url, null, { transports: ['xhr-streaming'] });
  s.onopen = () => events.push('open');
  s.onclose = (e) => events.push('close ' + e.code);
  // Wait until the client has the /info answer and waits for 'load'.
  for (let i = 0; i < 100 && !(listeners.load || []).length; i++) await sleep(20);
  const waiting = (listeners.load || []).length;
  s.close();
  await sleep(100);
  const before = srv.requests.length;
  // The page finishes loading.
  global.document.body = {};
  global.document.readyState = 'complete';
  for (const fn of (listeners.load || []).slice()) fn({ type: 'load' });
  await sleep(1000);
  const after = srv.requests.slice(before);
  const actual = { loadListenersWhenClosed: waiting, requestsAfterLoad: after, thrown, events, loadListenersLeft: (listeners.load || []).length };
  const expected = { loadListenersWhenClosed: 1, requestsAfterLoad: [], thrown: [], events: ['close 1000'], loadListenersLeft: 0 };
  const ok = verdict('a closed SockJS does not connect on window load',
    after.length === 0 && thrown.length === 0, actual, expected);
  await srv.close();
  process.exit(ok ? 0 : 1);
})();
