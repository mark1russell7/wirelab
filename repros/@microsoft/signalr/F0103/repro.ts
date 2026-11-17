// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// hub.stop() while a stateful reconnect is in progress cannot cancel the pending WebSocket.
// The onclose handler of HttpConnection calls transport.connect() again, but WebSocketTransport
// keeps the new socket in a local variable until it opens. stop() calls WebSocketTransport.stop(),
// which finds no _webSocket and does nothing. Then HttpConnection.stop() waits for
// _stopConnection(), which runs only when the pending connect settles. Thus stop() does not
// resolve while the server holds the upgrade. When the upgrade completes, the new socket stays open.
//
// Local server only: node:http and ws (noServer, so that the script can hold the second upgrade).
import http from "node:http";
import type { AddressInfo } from "node:net";
import { HttpTransportType, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";

const RS = "\x1e";
const HOLD_MS = 1500;
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

const sockets: WebSocket[] = [];
let upgrades = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "POST" && url.pathname === "/hub/negotiate") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        connectionId: "c1",
        connectionToken: "tok1",
        negotiateVersion: 1,
        useStatefulReconnect: true,
        availableTransports: [{ transport: "WebSockets", transferFormats: ["Text", "Binary"] }],
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end();
});
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  upgrades += 1;
  const accept = (): void =>
    wss.handleUpgrade(req, socket, head, (ws) => {
      const index = sockets.push(ws);
      ws.on("message", (data) => {
        if (index === 1 && String(data).startsWith('{"protocol"')) ws.send(`{}${RS}`);
      });
    });
  // The server holds the upgrade of the reconnect.
  if (upgrades === 1) accept();
  else setTimeout(accept, HOLD_MS);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

const hub = new HubConnectionBuilder()
  .withUrl(`http://127.0.0.1:${port}/hub`, { transport: HttpTransportType.WebSockets })
  .withStatefulReconnect()
  .configureLogging(LogLevel.None)
  .build();
hub.serverTimeoutInMilliseconds = 60000;

await hub.start();
sockets[0]?.terminate(); // A network drop starts the stateful reconnect.
while (upgrades < 2) await new Promise((resolve) => setTimeout(resolve, 10));

const t0 = Date.now();
let stopResolvedAt: number | null = null;
void hub.stop().then(() => {
  stopResolvedAt = Date.now() - t0;
});
await new Promise((resolve) => setTimeout(resolve, 500));
const resolvedWithin500 = stopResolvedAt !== null;
await new Promise((resolve) => setTimeout(resolve, HOLD_MS + 500));

const leaked = sockets.slice(1).filter((s) => s.readyState === s.OPEN).length;
console.log(`hub.stop() called while the server held the reconnect upgrade for ${HOLD_MS} ms`);
console.log(`hub.stop() resolved within 500 ms: ${resolvedWithin500}; resolved after: ${stopResolvedAt === null ? "never (so far)" : `${stopResolvedAt} ms`}`);
console.log(`hub.state: ${hub.state}; reconnect sockets still open after stop(): ${leaked}`);
console.log("expected: stop() stops the pending reconnect at once and leaves no open socket");

for (const s of sockets) s.terminate();
server.close();

if (!resolvedWithin500 || leaked > 0) {
  console.log("BUG PRESENT: stop() waited for the pending stateful-reconnect WebSocket, or left it open, or both.");
  process.exit(1);
}
console.log("OK");
process.exit(0);
