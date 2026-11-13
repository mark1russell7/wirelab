'use strict';
// An exception thrown by one message listener escapes SockJS's EventTarget (lib/event/eventtarget.js:41-60
// has no try/catch) into the transport callback that delivered the frame.
// Effects, all against a real sockjs-node server:
//  - the other listeners of the same event do not run;
//  - the rest of the messages of the same `a` frame are lost (lib/main.js:279 forEach is cut);
//  - with xhr-polling the receiver's 'finish' handler (lib/transport/receiver/xhr.js:21-29) is cut
//    before it emits 'close'/'network', so lib/transport/lib/polling.js never starts the next poll:
//    the connection stays OPEN forever, gets no more messages and fires no close event.
// A browser reports a listener exception and goes on (WHATWG DOM, "inner invoke": report the
// exception), and so does Node's own EventTarget. Node has no browser here, so this repro
// stands in for "report the exception" with process.on('uncaughtException').
const { req, timeLimit, verdict, sockjsServer, sleep } = require('./lib');
timeLimit(20000, '03-throwing-listener');
const SockJS = req('sockjs-client');

(async () => {
  let conn;
  const srv = await sockjsServer({
    onConnection(c) { conn = c; c.write('1'); c.write('2'); c.write('3'); },
  });
  const reported = [];
  process.on('uncaughtException', (err) => reported.push(err.message));
  const l2 = [];
  const events = [];
  const s = new SockJS(srv.url, null, { transports: ['xhr-polling'] });
  s.onmessage = (e) => { if (e.data === '1') throw new Error('app bug in onmessage'); };
  s.addEventListener('message', (e) => l2.push(e.data));
  s.onclose = (e) => events.push('close ' + e.code);
  await sleep(1000);
  const pollsBefore = srv.requests.filter((r) => r.includes('/xhr?') || r.endsWith('/xhr')).length;
  if (conn) conn.write('4');
  await sleep(1500);
  const pollsAfter = srv.requests.filter((r) => r.includes('/xhr?') || r.endsWith('/xhr')).length;
  const actual = { secondListenerGot: l2, reported, readyState: s.readyState, events, newPollsAfterThrow: pollsAfter - pollsBefore };
  const expected = { secondListenerGot: ['1', '2', '3', '4'], reported: ['app bug in onmessage'], readyState: 1, events: [], newPollsAfterThrow: '>= 1' };
  const ok = verdict('a throwing onmessage does not break other listeners, the batch, or the polling loop',
    JSON.stringify(l2) === JSON.stringify(['1', '2', '3', '4']), actual, expected);
  try { s.close(); } catch (e) { /* ignore */ }
  await srv.close();
  process.exit(ok ? 0 : 1);
})();
