// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import type { AddressInfo } from "node:net";
import WebSocket from "partysocket/ws";
import { WebSocketServer } from "ws";

process.on("uncaughtException", (e) => console.log("reported:", e.message));

const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await new Promise((resolve) => wss.once("listening", resolve));
wss.on("connection", (client) => client.send("hello"));

const ws = new WebSocket(`ws://127.0.0.1:${(wss.address() as AddressInfo).port}/`);
let messageListener = 0;
ws.addEventListener("message", () => messageListener++);
ws.onmessage = () => {
  throw new Error("bug in onmessage");
};
await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
await new Promise((resolve) => setTimeout(resolve, 200));
console.log("message listener calls:", messageListener);

let closeListener = 0;
ws.addEventListener("close", () => closeListener++);
ws.onclose = () => {
  throw new Error("bug in onclose");
};
ws.close();
await new Promise((resolve) => setTimeout(resolve, 200));
console.log("close listener calls:", closeListener);
for (const client of wss.clients) client.terminate();
wss.close();
