// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import type { AddressInfo } from "node:net";
import WebSocket from "partysocket/ws";
import { WebSocketServer } from "ws";

// A server that refuses each WebSocket upgrade, so the first attempt fails.
const wss = new WebSocketServer({ host: "127.0.0.1", port: 0, verifyClient: () => false });
await new Promise((resolve) => wss.once("listening", resolve));

// With the default options, the next attempt waits 3000 ms.
const ws = new WebSocket(`ws://127.0.0.1:${(wss.address() as AddressInfo).port}/`);
let closedAt = 0;
ws.addEventListener(
  "error",
  () => {
    wss.close();
    ws.close();
    closedAt = performance.now();
    console.log("close() called, readyState:", ws.readyState);
  },
  { once: true },
);
process.on("exit", () => {
  console.log(`the process exits ${Math.round(performance.now() - closedAt)} ms after close()`);
});
