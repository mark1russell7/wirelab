// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Fetch, Socket } from "engine.io-client";

let pending = false;

// A server (or a proxy) that answers the POST requests, but never answers the long-polling GET request.
const httpServer = createServer((req, res) => {
  if (req.method === "POST") {
    req.resume();
    req.on("end", () => res.end("ok"));
    return;
  }
  if (!new URL(req.url ?? "/", "http://x").searchParams.has("sid")) {
    res.end('0{"sid":"abc","upgrades":[],"pingInterval":10000,"pingTimeout":5000,"maxPayload":1000000}');
    return;
  }
  pending = true;
  console.log("server: long-polling request received (never answered)");
  res.on("close", () => {
    pending = false;
    console.log("server: long-polling request closed");
  });
});

httpServer.listen(0, "127.0.0.1", () => {
  const { port } = httpServer.address() as AddressInfo;
  const socket = new Socket(`http://127.0.0.1:${port}`, { transports: [Fetch] });
  // Close the socket while the long-polling request is pending.
  socket.on("open", () => setTimeout(() => socket.close(), 100));
  socket.on("close", (reason) => console.log(`client: close "${reason}"`));

  setTimeout(() => {
    console.log(`after 2 s, the long-polling request is still open: ${pending}`);
    process.exit(pending ? 1 : 0);
  }, 2000);
});
