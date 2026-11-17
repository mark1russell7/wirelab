// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// FetchHttpClient.send() (the default HTTP client in browsers and on Node.js) clears its timeout
// timer and removes request.abortSignal.onabort in a `finally` block when fetch() resolves, that is
// when the response HEADERS come. It reads the body after that, with no timeout and no abort.
// Thus a long-polling response whose body stops after the headers (a network stall in a large
// message, or a proxy that sends the headers early):
//   - does not time out (the poll timeout is 100 s), and
//   - cannot be aborted. LongPollingTransport.stop() aborts _pollAbort and waits for the poll,
//     so hub.stop() does not resolve while the body is stalled.
//
// Local server only: node:http. The third poll sends the headers and a part of the body, then stops.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { HttpTransportType, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";

const RS = "\x1e";
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

let polls = 0;
let pendingPoll: http.ServerResponse | null = null;
const stalled: http.ServerResponse[] = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "POST" && url.pathname === "/hub/negotiate") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        connectionId: "c1",
        connectionToken: "tok1",
        negotiateVersion: 1,
        availableTransports: [{ transport: "LongPolling", transferFormats: ["Text", "Binary"] }],
      }),
    );
    return;
  }
  if (req.method === "GET" && url.pathname === "/hub") {
    polls += 1;
    // The connect poll.
    if (polls === 1) {
      res.writeHead(200);
      res.end();
      return;
    }
    // The server answers this poll with the handshake response below.
    if (polls === 2) {
      pendingPoll = res;
      return;
    }
    // Poll 3: the headers and a half message, then the body stops.
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.write('{"type":1,"target":"big","arguments":["');
    stalled.push(res);
    return;
  }
  if (req.method === "POST" && url.pathname === "/hub") {
    let body = "";
    req.on("data", (c: Buffer) => {
      body += c.toString();
    });
    req.on("end", () => {
      res.writeHead(200);
      res.end();
      if (body.includes('"protocol"') && pendingPoll !== null) {
        pendingPoll.writeHead(200);
        pendingPoll.end(`{}${RS}`);
        pendingPoll = null;
      }
    });
    return;
  }
  if (req.method === "DELETE") {
    res.writeHead(202);
    res.end();
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

const hub = new HubConnectionBuilder()
  .withUrl(`http://127.0.0.1:${port}/hub`, { transport: HttpTransportType.LongPolling })
  .configureLogging(LogLevel.None)
  .build();
await hub.start();
while (stalled.length === 0) await new Promise((resolve) => setTimeout(resolve, 10));

const t0 = Date.now();
let stopResolvedAt: number | null = null;
void hub.stop().then(() => {
  stopResolvedAt = Date.now() - t0;
});
await new Promise((resolve) => setTimeout(resolve, 2000));

console.log(`hub.state: ${hub.state}`);
console.log(`hub.stop() during a poll whose body stopped after the headers: ${stopResolvedAt === null ? "still pending after 2000 ms" : `resolved after ${stopResolvedAt} ms`}`);
console.log("expected: stop() aborts the poll and resolves at once");

for (const r of stalled) r.destroy();
server.closeAllConnections();
server.close();
if (stopResolvedAt === null) {
  console.log("BUG PRESENT: the abort signal (and the timeout) have no effect after the response headers come.");
  process.exit(1);
}
console.log("OK");
process.exit(0);
