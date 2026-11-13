'use strict';
// Control for 02 and 03: the WHATWG WebSocket of Node 24 (undici), same pattern.
// (a) The server sends 3 messages in one TCP write; the client calls close() on the first.
// (b) The first message listener throws; does the second listener and the next message still run?
const { req, timeLimit, verdict } = require('./lib');
timeLimit(15000, '02b-control-native-ws');
const { WebSocketServer } = req('ws');

(async () => {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise((r) => wss.on('listening', r));
  wss.on('connection', (c) => { c.cork ? c.cork() : 0; c.send('1'); c.send('2'); c.send('3'); });
  const url = `ws://127.0.0.1:${wss.address().port}/`;

  const gotA = [];
  await new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.onmessage = (e) => { gotA.push(e.data + '@rs' + ws.readyState); if (e.data === '1') ws.close(); };
    ws.onclose = () => resolve();
  });

  const gotB = [];
  const reported = [];
  process.on('uncaughtException', (err) => reported.push(err.message));
  await new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.onmessage = (e) => { gotB.push('L1:' + e.data); if (e.data === '1') throw new Error('app bug'); };
    ws.addEventListener('message', (e) => { gotB.push('L2:' + e.data); if (e.data === '3') ws.close(); });
    ws.onclose = () => resolve();
  });
  await new Promise((r) => setTimeout(r, 50));

  let ok = verdict('(control a) native WebSocket: no message after close()',
    JSON.stringify(gotA) === JSON.stringify(['1@rs1']), gotA, ['1@rs1']);
  ok = verdict('(control b) native WebSocket: a throwing listener does not stop the others',
    JSON.stringify(gotB) === JSON.stringify(['L1:1', 'L2:1', 'L1:2', 'L2:2', 'L1:3', 'L2:3']) && reported.length === 1,
    { gotB, reported }, { gotB: ['L1:1', 'L2:1', 'L1:2', 'L2:2', 'L1:3', 'L2:3'], reported: ['app bug'] }) && ok;
  for (const c of wss.clients) c.terminate();
  wss.close();
  process.exit(ok ? 0 : 1);
})();
