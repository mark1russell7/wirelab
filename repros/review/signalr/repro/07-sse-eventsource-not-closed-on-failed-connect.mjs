// R07: ServerSentEventsTransport.connect() rejects when the EventSource fires "error" before
// "open", but it never calls eventSource.close() (ServerSentEventsTransport.ts, onerror handler).
// An EventSource retries on its own (the browser after a network error; the "eventsource"
// package used on Node after a network error or a 500/502/503/504), so the orphaned EventSource
// keeps sending GET requests to the server for ever after hub.start() has rejected. Its onmessage
// handler is still wired to the HubConnection.
//
// Local server only: node:http. The SSE endpoint answers 503 every time.
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const signalR = require("@microsoft/signalr");

let sseGets = 0;
const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "POST" && url.pathname === "/hub/negotiate") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            connectionId: "c1", connectionToken: "tok1", negotiateVersion: 1,
            availableTransports: [{ transport: "ServerSentEvents", transferFormats: ["Text"] }],
        }));
        return;
    }
    if (req.method === "GET" && url.pathname === "/hub") {
        sseGets++;
        res.writeHead(503); res.end();
        return;
    }
    res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const hub = new signalR.HubConnectionBuilder()
    .withUrl(`http://127.0.0.1:${port}/hub`, { transport: signalR.HttpTransportType.ServerSentEvents })
    .configureLogging(signalR.LogLevel.None)
    .build();

const startResult = await hub.start().then(() => "resolved", (e) => `rejected: ${e.message.slice(0, 90)}...`);
const getsAtReject = sseGets;
await new Promise((r) => setTimeout(r, 3500));
const getsLater = sseGets;

console.log(`hub.start(): ${startResult}`);
console.log(`hub.state: ${hub.state}`);
console.log(`SSE GET requests when start() rejected: ${getsAtReject}; 3.5 s later: ${getsLater}`);
console.log("expected: no new GET request after start() has rejected (the failed EventSource is closed)");

server.close();
if (getsLater > getsAtReject) {
    console.log("BUG PRESENT: the EventSource of the failed connect was never closed and keeps reconnecting.");
    process.exit(1);
}
console.log("OK");
process.exit(0);
