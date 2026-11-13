'use strict';
// Shared harness for the pusher-js repros: a fake Pusher Channels server
// (protocol 7 over WebSocket) on 127.0.0.1, a client factory, and helpers
// that print PASS or FAIL and exit with a time limit.
const { WebSocketServer } = require('ws');
const path = require('path');

const PUSHER_PATH = path.join(__dirname, '..', '..', 'node_modules', 'pusher-js');
const Pusher = require(PUSHER_PATH);

let socketSeq = 0;

// onConnection(ws, ctx) is called for each client connection. When
// `autoEstablish` is true (default) the server sends
// pusher:connection_established first. `handlers` maps pusher event names
// (pusher:subscribe, pusher:ping, ...) to functions (ws, msg, ctx).
function startServer(opts = {}) {
  const {
    autoEstablish = true,
    activityTimeout = 120,
    onConnection = () => {},
    handlers = {},
  } = opts;
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    const state = { connections: [], received: [] };
    wss.on('connection', (ws, req) => {
      const ctx = { index: state.connections.length, url: req.url, socketId: `${++socketSeq}.${1000 + socketSeq}` };
      state.connections.push({ ws, ctx });
      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch (e) { msg = { raw: raw.toString() }; }
        state.received.push({ conn: ctx.index, msg });
        const h = handlers[msg.event];
        if (h) h(ws, msg, ctx);
        else if (msg.event === 'pusher:ping') send(ws, { event: 'pusher:pong', data: {} });
        else if (msg.event === 'pusher:subscribe' && handlers.autoSubscribe !== false && !handlers['pusher:subscribe']) {
          // default: accept public subscriptions
          send(ws, { event: 'pusher_internal:subscription_succeeded', channel: msg.data.channel, data: '{}' });
        }
      });
      if (autoEstablish) {
        send(ws, {
          event: 'pusher:connection_established',
          data: JSON.stringify({ socket_id: ctx.socketId, activity_timeout: activityTimeout }),
        });
      }
      onConnection(ws, ctx);
    });
    wss.on('listening', () => {
      state.port = wss.address().port;
      state.wss = wss;
      resolve(state);
    });
  });
}

function send(ws, obj) {
  ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
}

function client(port, extra = {}) {
  return new Pusher('app-key', Object.assign({
    cluster: 'mt1',
    wsHost: '127.0.0.1',
    wsPort: port,
    forceTLS: false,
    enabledTransports: ['ws'],
    enableStats: false,
  }, extra));
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function waitFor(pred, ms, step = 10) {
  const until = Date.now() + ms;
  return new Promise((resolve) => {
    (function poll() {
      let ok = false;
      try { ok = pred(); } catch (e) { ok = false; }
      if (ok) return resolve(true);
      if (Date.now() > until) return resolve(false);
      setTimeout(poll, step);
    })();
  });
}

// Runs `main` with a hard time limit; main returns {pass, actual, expected, name}.
function run(name, main, limitMs = 20000) {
  const timer = setTimeout(() => {
    console.log(`FAIL ${name}: time limit of ${limitMs} ms reached`);
    process.exit(2);
  }, limitMs);
  main().then((r) => {
    clearTimeout(timer);
    const line = `${r.pass ? 'PASS' : 'FAIL'} ${name}\n  actual:   ${r.actual}\n  expected: ${r.expected}`;
    console.log(line);
    process.exit(r.pass ? 0 : 1);
  }, (e) => {
    clearTimeout(timer);
    console.log(`FAIL ${name}: harness error ${e && e.stack || e}`);
    process.exit(2);
  });
}

async function shutdown(server, ...clients) {
  for (const c of clients) { try { c.disconnect(); } catch (e) {} }
  if (server) {
    for (const { ws } of server.connections) { try { ws.terminate(); } catch (e) {} }
    await new Promise((r) => server.wss.close(() => r()));
  }
}

module.exports = { Pusher, PUSHER_PATH, startServer, send, client, sleep, waitFor, run, shutdown };
