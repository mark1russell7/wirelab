// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import type { AddressInfo } from "node:net";
import WebSocket from "partysocket/ws";
import { WebSocketServer, WebSocket as NodeWebSocket } from "ws";

const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await new Promise((resolve) => wss.once("listening", resolve));
const url = `ws://127.0.0.1:${(wss.address() as AddressInfo).port}/`;

async function closeFromServer(
  label: string,
  serverAction: (client: NodeWebSocket) => void,
  options: { WebSocket?: typeof NodeWebSocket } = {},
) {
  wss.once("connection", (client) => setTimeout(() => serverAction(client), 20));
  const ws = new WebSocket(url, undefined, { maxRetries: 0, ...options });
  ws.onclose = (e) =>
    console.log(`${label}: onclose        code ${e.code} reason ${JSON.stringify(e.reason)} wasClean ${e.wasClean}`);
  ws.addEventListener("close", (e) =>
    console.log(`${label}: close listener code ${e.code} reason ${JSON.stringify(e.reason)} wasClean ${e.wasClean}`),
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  ws.onclose = null;
  ws.close();
}

// The server closes normally, with no reason (the global WebSocket of Node.js).
await closeFromServer("server close(1000)", (c) => c.close(1000));
// The server drops the connection with no close frame (the client of the package ws).
await closeFromServer("server terminate()", (c) => c.terminate(), { WebSocket: NodeWebSocket });
wss.close();
