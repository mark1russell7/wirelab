// R03: with withStatefulReconnect(), an internal stop (server timeout here; also a server Close
// message or a bad Sequence message) calls HttpConnection.stop() without clearing
// features.reconnect. WebSocketTransport.stop() fires onclose inline, and the stateful-reconnect
// onclose handler in HttpConnection._startTransport() then opens a NEW WebSocket to the same
// connection token. The resend on it fails (HttpConnection is "Disconnecting"), _stopConnection()
// runs, but the new socket is never closed. The HubConnection is "Disconnected", yet the socket
// stays open and its messages are still dispatched to hub.on() handlers.
//
// Local server only: node:http for /negotiate + the ws package for the WebSocket endpoint.
import http from "node:http";
import { createRequire } from "node:module";
import { WebSocketServer } from "ws";
const require = createRequire(import.meta.url);
const signalR = require("@microsoft/signalr");

const RS = "\x1e";
const sockets = [];

const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "POST" && url.pathname === "/hub/negotiate") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            connectionId: "c1", connectionToken: "tok1", negotiateVersion: 1,
            useStatefulReconnect: url.searchParams.get("useStatefulReconnect") === "true",
            availableTransports: [{ transport: "WebSockets", transferFormats: ["Text", "Binary"] }],
        }));
        return;
    }
    res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ server, path: "/hub" });
wss.on("connection", (ws, req) => {
    const index = sockets.push(ws);
    let first = true;
    ws.on("message", () => {
        if (first && index === 1) {
            ws.send("{}" + RS);   // handshake response on the first socket, then silence -> client server timeout
        }
        first = false;
    });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const hub = new signalR.HubConnectionBuilder()
    .withUrl(`http://127.0.0.1:${port}/hub`, { transport: signalR.HttpTransportType.WebSockets })
    .withStatefulReconnect()
    .withServerTimeout(300)
    .withKeepAliveInterval(100)
    .configureLogging(signalR.LogLevel.None)
    .build();

let zombieCalls = 0;
hub.on("zombie", () => { zombieCalls++; });
const closed = new Promise((resolve) => hub.onclose((e) => resolve(e)));

await hub.start();
const closeError = await closed;          // the server timeout fires after ~300 ms
await new Promise((r) => setTimeout(r, 300));

const openAfterClose = sockets.filter((s) => s.readyState === s.OPEN);
// The server uses the leaked socket: the closed HubConnection still dispatches it.
for (const s of openAfterClose) {
    s.send(JSON.stringify({ type: 1, target: "zombie", arguments: [] }) + RS);
}
await new Promise((r) => setTimeout(r, 200));

console.log(`hub.onclose error: ${closeError && closeError.message}`);
console.log(`hub.state after close: ${hub.state}`);
console.log(`WebSocket connections the client opened: ${sockets.length}; still open 300 ms after onclose: ${openAfterClose.length}`);
console.log(`hub.on("zombie") calls after the hub was Disconnected: ${zombieCalls}`);
console.log("expected: no socket stays open after onclose, and no handler runs on a Disconnected hub");

for (const s of sockets) { s.terminate(); }
wss.close(); server.close();

if (openAfterClose.length > 0 || zombieCalls > 0) {
    console.log("BUG PRESENT: an internal stop started a stateful reconnect; the new WebSocket leaked and still feeds the closed hub.");
    process.exit(1);
}
console.log("OK");
process.exit(0);
