// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// The Server-Sent Events transport with a connect that fails. The onerror handler before the open
// rejects connect(), but it does not call eventSource.close(). The transport keeps the EventSource
// in _eventSource only after the open, so stop() cannot close it. Thus the EventSource goes on with
// its own reconnects after start() has rejected, and the client sends a new GET request each time.
//
// Local server only: node:http answers /negotiate and gives the status 503 to each SSE GET request.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { HttpTransportType, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

let sseGets = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "POST" && url.pathname === "/hub/negotiate") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        connectionId: "c1",
        connectionToken: "tok1",
        negotiateVersion: 1,
        availableTransports: [{ transport: "ServerSentEvents", transferFormats: ["Text"] }],
      }),
    );
    return;
  }
  if (req.method === "GET" && url.pathname === "/hub") {
    sseGets += 1;
    res.writeHead(503);
    res.end();
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

const hub = new HubConnectionBuilder()
  .withUrl(`http://127.0.0.1:${port}/hub`, { transport: HttpTransportType.ServerSentEvents })
  .configureLogging(LogLevel.None)
  .build();

const startResult = await hub.start().then(
  () => "resolved",
  (e: unknown) => `rejected: ${(e as Error).message.slice(0, 90)}...`,
);
const getsAtReject = sseGets;
await new Promise((resolve) => setTimeout(resolve, 3500));
const getsLater = sseGets;

console.log(`hub.start(): ${startResult}`);
console.log(`hub.state: ${hub.state}`);
console.log(`SSE GET requests when start() rejected: ${getsAtReject}; 3.5 s later: ${getsLater}`);
console.log("expected: no new GET request after start() has rejected (the client closes the failed EventSource)");

server.closeAllConnections();
server.close();
if (getsLater > getsAtReject) {
  console.log("BUG PRESENT: nothing closed the EventSource of the failed connect, and it goes on with its reconnects.");
  process.exit(1);
}
console.log("OK");
process.exit(0);
