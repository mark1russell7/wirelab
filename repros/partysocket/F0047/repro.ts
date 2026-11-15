// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// The README says that the default minReconnectionDelay is 1000 + Math.random() * 4000. Three sockets with the
// default options lose the same server at the same time. This prints the wait of each socket between its first
// and its second connection attempt.
import WebSocket from "partysocket/ws";

// A server that refuses each connection at once.
class RefusedWebSocket extends EventTarget {
  readyState = 0;
  constructor() {
    super();
    setTimeout(() => {
      this.readyState = 3;
      this.dispatchEvent(new Event("error"));
    }, 0);
  }
  send() {}
  close() {}
}

const sockets = [1, 2, 3].map((i) => {
  const attempts: number[] = [];
  const ws = new WebSocket(
    () => {
      attempts.push(Date.now());
      return "ws://example.test/";
    },
    undefined,
    { WebSocket: RefusedWebSocket },
  );
  return { i, ws, attempts };
});

setTimeout(() => {
  for (const { i, ws, attempts } of sockets) {
    console.log(`socket ${i}: wait before the 2nd attempt: ${attempts[1] - attempts[0]} ms`);
    ws.close();
  }
}, 5500);
