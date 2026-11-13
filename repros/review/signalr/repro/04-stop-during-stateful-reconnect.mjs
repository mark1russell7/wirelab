// R04: hub.stop() while a stateful reconnect is in progress cannot cancel the pending WebSocket.
// HttpConnection's onclose handler calls transport.connect() again, but WebSocketTransport keeps the
// new socket in a local variable until it opens. stop() -> WebSocketTransport.stop() sees no
// _webSocket and does nothing, then HttpConnection.stop() waits for _stopConnection(), which only
// runs when the pending connect settles. So stop() does not resolve while the server holds the
// upgrade, and when the upgrade completes the new socket is left open.
//
// Local server only: node:http + ws (noServer, so the test can hold the second upgrade).
import http from "node:http";
import { createRequire } from "node:module";
import { WebSocketServer } from "ws";
const require = createRequire(import.meta.url);
const signalR = require("@microsoft/signalr");

const RS = "\x1e";
const HOLD_MS = 1500;
const sockets = [];
let upgrades = 0;

const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "POST" && url.pathname === "/hub/negotiate") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            connectionId: "c1", connectionToken: "tok1", negotiateVersion: 1, useStatefulReconnect: true,
            availableTransports: [{ transport: "WebSockets", transferFormats: ["Text", "Binary"] }],
        }));
        return;
    }
    res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
    upgrades++;
    const accept = () => wss.handleUpgrade(req, socket, head, (ws) => {
        const index = sockets.push(ws);
        ws.on("message", (data) => {
            if (index === 1 && String(data).startsWith("{\"protocol\"")) {
                ws.send("{}" + RS);
            }
        });
    });
    if (upgrades === 1) { accept(); } else { setTimeout(accept, HOLD_MS); }  // hold the reconnect upgrade
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const hub = new signalR.HubConnectionBuilder()
    .withUrl(`http://127.0.0.1:${port}/hub`, { transport: signalR.HttpTransportType.WebSockets })
    .withStatefulReconnect()
    .configureLogging(signalR.LogLevel.None)
    .build();
hub.serverTimeoutInMilliseconds = 60000;

await hub.start();
sockets[0].terminate();                                   // network drop -> stateful reconnect starts
while (upgrades < 2) { await new Promise((r) => setTimeout(r, 10)); }

const t0 = Date.now();
let stopResolvedAt = null;
hub.stop().then(() => { stopResolvedAt = Date.now() - t0; });
await new Promise((r) => setTimeout(r, 500));
const resolvedWithin500 = stopResolvedAt !== null;
await new Promise((r) => setTimeout(r, HOLD_MS + 500));

const leaked = sockets.slice(1).filter((s) => s.readyState === s.OPEN).length;
console.log(`hub.stop() called while the reconnect upgrade was held for ${HOLD_MS} ms`);
console.log(`hub.stop() resolved within 500 ms: ${resolvedWithin500}; resolved after: ${stopResolvedAt === null ? "never (so far)" : stopResolvedAt + " ms"}`);
console.log(`hub.state: ${hub.state}; reconnect sockets still open after stop(): ${leaked}`);
console.log("expected: stop() aborts the pending reconnect at once and leaves no open socket");

for (const s of sockets) { s.terminate(); }
server.close();

if (!resolvedWithin500 || leaked > 0) {
    console.log("BUG PRESENT: stop() waited for the pending stateful-reconnect WebSocket and/or left it open.");
    process.exit(1);
}
console.log("OK");
process.exit(0);
