// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import type { AddressInfo } from "node:net";
import WebSocket from "partysocket/ws";
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await new Promise((resolve) => wss.once("listening", resolve));
let connections = 0;
wss.on("connection", () => connections++);
const { port } = wss.address() as AddressInfo;

const ws = new WebSocket(`ws://127.0.0.1:${port}/`, undefined, {
  // no automatic reconnection after a normal closure
  shouldReconnectOnClose: (e) => e.code !== 1000,
});
await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
ws.reconnect();
await new Promise((resolve) => setTimeout(resolve, 500));
console.log("connections:", connections);
console.log("readyState:", ws.readyState);
console.log("shouldReconnect:", ws.shouldReconnect);
ws.close();
for (const client of wss.clients) client.terminate();
wss.close();
