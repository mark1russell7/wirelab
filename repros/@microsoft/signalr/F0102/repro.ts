// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// With withStatefulReconnect(), an internal stop (here the server timeout, also a Close message of
// the server or a bad Sequence message) calls HttpConnection.stop() and does not clear
// features.reconnect. WebSocketTransport.stop() gives onclose at once, and the stateful-reconnect
// onclose handler of HttpConnection._startTransport() then opens a NEW WebSocket with the same
// connection token. The resend on it fails (HttpConnection is "Disconnecting"), and
// _stopConnection() runs, but nothing closes the new socket. The HubConnection is "Disconnected",
// but the socket stays open, and the client still gives its messages to the hub.on() handlers.
//
// Local server only: node:http for /negotiate and the ws package for the WebSocket endpoint.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { HttpTransportType, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";

const RS = "\x1e";
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

const sockets: WebSocket[] = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "POST" && url.pathname === "/hub/negotiate") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        connectionId: "c1",
        connectionToken: "tok1",
        negotiateVersion: 1,
        useStatefulReconnect: url.searchParams.get("useStatefulReconnect") === "true",
        availableTransports: [{ transport: "WebSockets", transferFormats: ["Text", "Binary"] }],
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end();
});
const wss = new WebSocketServer({ server, path: "/hub" });
wss.on("connection", (ws) => {
  const index = sockets.push(ws);
  let first = true;
  ws.on("message", () => {
    // The first socket gets the handshake response, and then no message: the server timeout of the client.
    if (first && index === 1) ws.send(`{}${RS}`);
    first = false;
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

const hub = new HubConnectionBuilder()
  .withUrl(`http://127.0.0.1:${port}/hub`, { transport: HttpTransportType.WebSockets })
  .withStatefulReconnect()
  .withServerTimeout(300)
  .withKeepAliveInterval(100)
  .configureLogging(LogLevel.None)
  .build();

let zombieCalls = 0;
hub.on("zombie", () => {
  zombieCalls += 1;
});
const closed = new Promise<Error | undefined>((resolve) => hub.onclose((error) => resolve(error)));

await hub.start();
const closeError = await closed; // The server timeout comes after about 300 ms.
await new Promise((resolve) => setTimeout(resolve, 300));

const openAfterClose = sockets.filter((s) => s.readyState === s.OPEN);
for (const s of openAfterClose) s.send(`${JSON.stringify({ type: 1, target: "zombie", arguments: [] })}${RS}`);
await new Promise((resolve) => setTimeout(resolve, 200));

console.log(`hub.onclose error: ${closeError?.message}`);
console.log(`hub.state after close: ${hub.state}`);
console.log(`WebSocket connections the client opened: ${sockets.length}; still open 300 ms after onclose: ${openAfterClose.length}`);
console.log(`hub.on("zombie") calls after the hub was Disconnected: ${zombieCalls}`);
console.log("expected: no socket stays open after onclose, and no handler runs on a Disconnected hub");

for (const s of sockets) s.terminate();
wss.close();
server.close();

if (openAfterClose.length > 0 || zombieCalls > 0) {
  console.log("BUG PRESENT: an internal stop started a stateful reconnect. The new WebSocket stays open and still gives messages to the closed hub.");
  process.exit(1);
}
console.log("OK");
process.exit(0);
