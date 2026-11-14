// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import type { AddressInfo } from "node:net";
import Pusher from "pusher-js";
import { WebSocketServer } from "ws";

// A fake Pusher server (protocol 7). The client never sends pusher:subscribe here, because the
// authorization fails first.
const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
wss.on("connection", (ws) => {
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
      // The authorization response of a presence channel has no channel_data, and no user signed in.
      customHandler: (_params, callback) => callback(null, { auth: "app-key:signature" }),
    },
  });
  pusher.connection.bind("connected", () => {
    const channel = pusher.subscribe("presence-room");
    channel.bind("pusher:subscription_error", (e: { type: string; error: unknown }) =>
      console.log(`pusher:subscription_error: type=${e.type}, error=${JSON.stringify(e.error) ?? "undefined"}`),
    );
    setTimeout(() => {
      pusher.disconnect();
      wss.close();
      process.exit(0);
    }, 1000);
  });
});
