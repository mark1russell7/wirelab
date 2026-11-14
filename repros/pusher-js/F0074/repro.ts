// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import type { AddressInfo } from "node:net";
import Pusher from "pusher-js";
import { WebSocketServer, type WebSocket } from "ws";

// A fake Pusher server (protocol 7). It does not confirm subscriptions on the first connection,
// and confirms each subscription on later connections.
const sockets: WebSocket[] = [];
const subscribes: string[][] = [];
const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
wss.on("connection", (ws) => {
  const index = sockets.push(ws) - 1;
  subscribes.push([]);
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString()) as { event: string; data: { channel: string } };
    if (msg.event !== "pusher:subscribe") return;
    subscribes[index].push(msg.data.channel);
    if (index > 0) {
      ws.send(JSON.stringify({ event: "pusher_internal:subscription_succeeded", channel: msg.data.channel, data: "{}" }));
    }
  });
  const data = { socket_id: `${index + 1}.1`, activity_timeout: 120 };
  ws.send(JSON.stringify({ event: "pusher:connection_established", data: JSON.stringify(data) }));
});

wss.on("listening", () => {
  const pusher = new Pusher("app-key", {
    cluster: "mt1",
    wsHost: "127.0.0.1",
    wsPort: (wss.address() as AddressInfo).port,
    forceTLS: false,
    enabledTransports: ["ws"],
    enableStats: false,
  });
  let succeeded = 0;
  pusher.connection.bind("connected", () => {
    if (sockets.length !== 1) return;
    pusher.subscribe("room").bind("pusher:subscription_succeeded", () => succeeded++);
    setTimeout(() => {
      // The app leaves the channel before the server confirms it. Then the connection drops.
      pusher.unsubscribe("room");
      console.log("unsubscribe(\"room\") while its subscription is pending, then the connection drops");
      sockets[0].terminate();
    }, 200);
  });

  setTimeout(() => {
    console.log(`connections: ${sockets.length}`);
    console.log(`pusher:subscribe on the new connection: [${(subscribes[1] ?? []).join(", ")}]`);
    console.log(`pusher:subscription_succeeded events: ${succeeded}`);
    console.log(`allChannels(): [${pusher.allChannels().map((c) => c.name).join(", ")}]`);
    pusher.disconnect();
    wss.close();
    process.exit(0);
  }, 4000);
});
