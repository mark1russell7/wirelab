// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import http from "node:http";
import type { AddressInfo } from "node:net";
import SockJS from "sockjs-client";

// WHATWG WebSockets, close(): if the connection is not yet established, fail the WebSocket connection.
// Failing gives an error event, then a close event with wasClean false and the code 1006.
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

// a server that answers /info, starts each xhr_streaming response with no open frame, and never ends a WebSocket handshake
let streaming = false;
const server = http.createServer((req, res) => {
  if ((req.url ?? "").startsWith("/echo/info")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ websocket: false, cookie_needed: false, origins: ["*:*"], entropy: 1 }));
  } else if ((req.url ?? "").includes("/xhr_streaming")) {
    streaming = true;
    res.writeHead(200, { "Content-Type": "application/javascript" });
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.on("upgrade", () => {});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function record(sock: WebSocket): string[] {
  const events: string[] = [];
  sock.onerror = () => events.push("error");
  sock.onclose = (e) => events.push(`close code=${e.code} clean=${e.wasClean}`);
  return events;
}

server.listen(0, "127.0.0.1", async () => {
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/echo`;

  // close() while the /info request is pending
  const s1 = new SockJS(url, null, { transports: ["xhr-streaming"] });
  const infoPhase = record(s1);
  s1.close();
  await sleep(100);

  // close() after /info, while the transport connects
  const s2 = new SockJS(url, null, { transports: ["xhr-streaming"], timeout: 5000 });
  const transportPhase = record(s2);
  for (let i = 0; i < 50 && !streaming; i++) await sleep(20);
  const readyStateBeforeClose = s2.readyState;
  s2.close();
  await sleep(100);

  // the native WebSocket of Node.js: close() before the handshake ends
  const ws = new WebSocket(`ws://127.0.0.1:${port}/raw`);
  const nativeWebSocket = record(ws);
  ws.close();
  await sleep(200);

  const fail = ["error", "close code=1006 clean=false"];
  const actual = { infoPhase, transportPhase, readyStateBeforeClose, nativeWebSocket };
  const expected = { infoPhase: fail, transportPhase: fail, readyStateBeforeClose: 0, nativeWebSocket: fail };
  console.log(`actual:   ${JSON.stringify(actual)}`);
  console.log(`expected: ${JSON.stringify(expected)}`);
  server.closeAllConnections();
  server.close();
  process.exit(JSON.stringify(actual) === JSON.stringify(expected) ? 0 : 1);
});
