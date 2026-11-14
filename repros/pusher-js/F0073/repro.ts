// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import type { AddressInfo } from "node:net";
import Pusher from "pusher-js";
import { WebSocketServer } from "ws";

// The channel names "constructor", "toString", "valueOf", "hasOwnProperty" and "__proto__" use only
// valid characters. A fake Pusher server (protocol 7) accepts each subscription and then sends one
// event on each channel.
const NAMES = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"];
const subscribes: string[] = [];
const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString()) as { event: string; data: { channel: string } };
    if (msg.event === "pusher:subscribe") {
      subscribes.push(msg.data.channel);
      ws.send(JSON.stringify({ event: "pusher_internal:subscription_succeeded", channel: msg.data.channel, data: "{}" }));
    }
  });
  const data = { socket_id: "1.1", activity_timeout: 120 };
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
  const received: string[] = [];
  pusher.connection.bind("connected", () => {
    for (const name of NAMES) {
      try {
        pusher.subscribe(name).bind("evt", () => received.push(name));
        console.log(`subscribe("${name}"): ok`);
      } catch (e) {
        console.log(`subscribe("${name}"): ${(e as Error).constructor.name}: ${(e as Error).message}`);
      }
    }
    setTimeout(() => {
      for (const ws of wss.clients) {
        for (const name of NAMES) ws.send(JSON.stringify({ event: "evt", channel: name, data: "{}" }));
      }
    }, 500);
  });

  setTimeout(() => {
    console.log(`pusher:subscribe sent for: [${subscribes.join(", ")}]`);
    console.log(`events received for: [${received.join(", ")}]`);
    pusher.disconnect();
    wss.close();
    process.exit(0);
  }, 2000);
});
