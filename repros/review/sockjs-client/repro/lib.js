'use strict';
// Shared helpers for the sockjs-client 1.6.1 repros.
// Each repro: prints PASS or FAIL with actual and expected, exits 1 on FAIL,
// closes its servers, and has a hard time limit.

const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const req = (m) => require(path.join(ROOT, 'node_modules', m));

function timeLimit(ms, name) {
  const t = setTimeout(() => {
    console.log(`FAIL ${name}: time limit ${ms} ms reached`);
    process.exit(1);
  }, ms);
  t.unref();
  return t;
}

function verdict(name, ok, actual, expected) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  console.log(`  actual:   ${typeof actual === 'string' ? actual : JSON.stringify(actual)}`);
  console.log(`  expected: ${typeof expected === 'string' ? expected : JSON.stringify(expected)}`);
  return ok;
}

// A real sockjs-node echo server on 127.0.0.1. Records every HTTP request URL.
function sockjsServer(opts) {
  opts = opts || {};
  const sockjs = req('sockjs');
  const srv = sockjs.createServer(Object.assign({ log: () => {} }, opts.sockjs || {}));
  const conns = [];
  srv.on('connection', (conn) => {
    conns.push(conn);
    if (opts.onConnection) { opts.onConnection(conn); return; }
    conn.on('data', (d) => conn.write(d));
  });
  const requests = [];
  const server = http.createServer();
  server.on('request', (r) => { requests.push(r.method + ' ' + r.url); });
  server.on('upgrade', (r) => { requests.push('UPGRADE ' + r.url); });
  srv.installHandlers(server, { prefix: opts.prefix || '/echo' });
  const sockets = new Set();
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        port,
        url: `http://127.0.0.1:${port}${opts.prefix || '/echo'}`,
        requests,
        conns,
        close() {
          for (const c of conns) { try { c.close(); } catch (e) { /* ignore */ } }
          for (const s of sockets) s.destroy();
          return new Promise((r) => server.close(() => r()));
        },
        // Drop every TCP connection with no SockJS close frame, as a crash or a reset would.
        crash() {
          for (const s of sockets) s.destroy();
          return new Promise((r) => server.close(() => r()));
        },
      });
    });
  });
}

// A plain HTTP server with a handler, for hand-written frames.
function rawServer(handler, onUpgrade) {
  const server = http.createServer(handler);
  if (onUpgrade) server.on('upgrade', onUpgrade);
  const sockets = new Set();
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        server,
        close() {
          for (const s of sockets) s.destroy();
          return new Promise((r) => server.close(() => r()));
        },
      });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { req, timeLimit, verdict, sockjsServer, rawServer, sleep, ROOT };
