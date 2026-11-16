// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import http from "node:http";
import type { AddressInfo } from "node:net";
import SockJS from "sockjs-client";

// The script closes the socket while xhr-streaming waits for the open frame, then closes its server, and then
// does nothing. Node.js exits when no timer and no handle is left. The script measures that time.
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

// a server that answers /info and starts each xhr_streaming response with no open frame
let streaming: () => void = () => {};
const seen = new Promise<void>((resolve) => (streaming = resolve));
const server = http.createServer((req, res) => {
  if ((req.url ?? "").startsWith("/echo/info")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ websocket: false, cookie_needed: false, origins: ["*:*"], entropy: 1 }));
  } else if ((req.url ?? "").includes("/xhr_streaming")) {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    streaming();
  } else {
    res.writeHead(404);
    res.end();
  }
});

let closedAt = 0;
process.on("exit", () => {
  const ms = Date.now() - closedAt;
  console.log(`actual:   the process exits ${ms} ms after the close event`);
  console.log("expected: the process exits less than 1000 ms after the close event");
  process.exitCode = ms < 1000 ? 0 : 1;
});

server.listen(0, "127.0.0.1", async () => {
  const { port } = server.address() as AddressInfo;
  const sock = new SockJS(`http://127.0.0.1:${port}/echo`, null, { transports: ["xhr-streaming"], timeout: 8000 });
  await seen;
  sock.onclose = (e) => {
    closedAt = Date.now();
    server.closeAllConnections();
    server.close(() => {
      console.log(`close event: code ${e.code}`);
      console.log(`active resources after server.close(): ${JSON.stringify(process.getActiveResourcesInfo())}`);
    });
  };
  sock.close();
});
