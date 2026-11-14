// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import type { AddressInfo } from "node:net";
import PartySocket from "partysocket";
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await new Promise((resolve) => wss.once("listening", resolve));
wss.on("connection", (_client, req) => {
  console.log("the server got the URL:", req.url);
});
const host = `127.0.0.1:${(wss.address() as AddressInfo).port}`;

// room "a?b"
const a = new PartySocket({ host, room: "a?b", id: "client-1" });
await new Promise((resolve) => setTimeout(resolve, 300));
a.close();

// room "a#b"
const b = new PartySocket({ host, room: "a#b", minReconnectionDelay: 50, maxReconnectionDelay: 50 });
let errors = 0;
let firstError: string | undefined;
b.addEventListener("error", (e) => {
  errors++;
  firstError ??= e.message;
});
await new Promise((resolve) => setTimeout(resolve, 500));
console.log(`room "a#b": ${errors} error events in 500 ms, the first: ${firstError}`);
b.close();
for (const client of wss.clients) client.terminate();
wss.close();
