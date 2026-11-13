// R18: FetchHttpClient.send() (the default HTTP client in browsers and on Node) clears its
// timeout timer and unhooks request.abortSignal.onabort in a `finally` right after fetch()
// resolves, i.e. when the response HEADERS arrive. The body is read after that with no timeout
// and no abort. A long-polling response whose body stalls after the headers (a network stall in
// the middle of a large message, or a proxy that sends headers early) therefore:
//   - never times out (the poll timeout is 100 s), and
//   - cannot be aborted: LongPollingTransport.stop() aborts _pollAbort and waits for the poll,
//     so hub.stop() does not resolve while the body is stalled.
//
// Local server only: node:http. The third poll sends headers and part of the body, then stalls.
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const signalR = require("@microsoft/signalr");

const RS = "\x1e";
let polls = 0;
let pendingPoll = null;
const stalled = [];
const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "POST" && url.pathname === "/hub/negotiate") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            connectionId: "c1", connectionToken: "tok1", negotiateVersion: 1,
            availableTransports: [{ transport: "LongPolling", transferFormats: ["Text", "Binary"] }],
        }));
        return;
    }
    if (req.method === "GET" && url.pathname === "/hub") {
        polls++;
        if (polls === 1) { res.writeHead(200); res.end(); return; }          // connect poll
        if (polls === 2) { pendingPoll = res; return; }                       // answered with the handshake below
        // poll 3: headers and half a message, then the body stalls
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.write("{\"type\":1,\"target\":\"big\",\"arguments\":[\"");
        stalled.push(res);
        return;
    }
    if (req.method === "POST" && url.pathname === "/hub") {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => {
            res.writeHead(200); res.end();
            if (body.includes("\"protocol\"") && pendingPoll) { pendingPoll.writeHead(200); pendingPoll.end("{}" + RS); pendingPoll = null; }
        });
        return;
    }
    if (req.method === "DELETE") { res.writeHead(202); res.end(); return; }
    res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const hub = new signalR.HubConnectionBuilder()
    .withUrl(`http://127.0.0.1:${port}/hub`, { transport: signalR.HttpTransportType.LongPolling })
    .configureLogging(signalR.LogLevel.None)
    .build();
await hub.start();
while (stalled.length === 0) { await new Promise((r) => setTimeout(r, 10)); }

const t0 = Date.now();
let stopResolvedAt = null;
hub.stop().then(() => { stopResolvedAt = Date.now() - t0; });
await new Promise((r) => setTimeout(r, 2000));

console.log(`hub.state: ${hub.state}`);
console.log(`hub.stop() during a poll whose body stalled after the headers: ${stopResolvedAt === null ? "still pending after 2000 ms" : "resolved after " + stopResolvedAt + " ms"}`);
console.log("expected: stop() aborts the poll and resolves at once");

for (const r of stalled) { r.destroy(); }
server.closeAllConnections?.(); server.close();
if (stopResolvedAt === null) {
    console.log("BUG PRESENT: the abort signal (and the timeout) no longer apply once the response headers have arrived.");
    process.exit(1);
}
console.log("OK");
process.exit(0);
