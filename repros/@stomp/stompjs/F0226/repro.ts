// Repro: @stomp/stompjs 7.5.0, the connection timeout timer stays after deactivate().
//
// The client starts a timer for connectionTimeout and stops it only on CONNECTED or at
// the next connect. deactivate() does not stop it, so after deactivate() resolves, the
// timer keeps a Node.js process alive until the timeout ends.
import { Client } from "@stomp/stompjs";
import { WebSocket, WebSocketServer } from "ws";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A WebSocket server that accepts the connection and never sends CONNECTED.
const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
await new Promise((resolve) => wss.on("listening", resolve));
const { port } = wss.address() as { port: number };

const client = new Client({
  webSocketFactory: () => new WebSocket(`ws://127.0.0.1:${port}`, ["v12.stomp", "v11.stomp", "v10.stomp"]),
  reconnectDelay: 0,
  heartbeatIncoming: 0,
  heartbeatOutgoing: 0,
  connectionTimeout: 5000,
});
client.activate();
await sleep(200);
await client.deactivate();
for (const c of wss.clients) c.terminate();
wss.close();
await sleep(100);
const timers = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
console.log(`state ${client.state} (2 is INACTIVE), Timeout handles after deactivate(): ${timers}`);
console.log(timers > 0 ? "BUG PRESENT" : "BUG ABSENT");
process.exit(0);
