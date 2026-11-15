// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import type { AddressInfo } from "node:net";
import Pusher from "pusher-js";
import { WebSocketServer } from "ws";

process.on("unhandledRejection", (e) => console.log(`unhandled rejection: ${(e as Error).message ?? String(e)}`));

// A fake Pusher server (protocol 7) that accepts each subscription.
const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString()) as { event: string; data: { channel: string } };
    if (msg.event !== "pusher:subscribe") return;
    ws.send(JSON.stringify({ event: "pusher_internal:subscription_succeeded", channel: msg.data.channel, data: "{}" }));
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
    channelAuthorization: {
      // The authorization response has channel_data that is not valid JSON.
      customHandler: (_params, callback) => callback(null, { auth: "app-key:signature", channel_data: "{user_id: 1}" }),
    },
  });
  pusher.connection.bind("connected", () => {
    const channel = pusher.subscribe("presence-room");
    channel.bind("pusher:subscription_error", (e: { type: string; error: unknown }) =>
      console.log(`pusher:subscription_error: ${JSON.stringify(e)}`),
    );
    setTimeout(() => {
      console.log(`after 1 s: subscriptionPending=${channel.subscriptionPending}, subscribed=${channel.subscribed}`);
      pusher.disconnect();
      wss.close();
      process.exit(0);
    }, 1000);
  });
});
