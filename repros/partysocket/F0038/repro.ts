// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import type { AddressInfo } from "node:net";
import WebSocket from "partysocket/ws";
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await new Promise((resolve) => wss.once("listening", resolve));
let serverSawClose = false;
const received: string[] = [];
wss.on("connection", (client) => {
  client.on("message", (m) => received.push(String(m)));
  client.on("close", () => (serverSawClose = true));
});
const { port } = wss.address() as AddressInfo;

// The global WebSocket of Node.js (WHATWG) accepts only the close codes 1000 and 3000-4999.
const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
let closeEvents = 0;
ws.addEventListener("close", () => closeEvents++);
await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

try {
  ws.close(1001, "going away");
  console.log("close() threw: no");
} catch (e) {
  console.log("close() threw:", (e as Error).name);
}
console.log("readyState:", ws.readyState);
console.log("close events:", closeEvents);
ws.send("sent after close()");

setTimeout(() => {
  console.log("server saw a close:", serverSawClose);
  console.log("server received:", JSON.stringify(received));
  process.exit(0);
}, 500);
