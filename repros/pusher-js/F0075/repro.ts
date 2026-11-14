// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import type { AddressInfo } from "node:net";
import Pusher from "pusher-js";
import { WebSocketServer } from "ws";

// A fake Pusher server (protocol 7). After the subscription, it sends the event "evt" four times,
// with the data 0, false, null and "" (each a valid JSON text).
const PAYLOADS = ["0", "false", "null", '""'];
const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString()) as { event: string; data: { channel: string } };
    if (msg.event !== "pusher:subscribe") return;
    ws.send(JSON.stringify({ event: "pusher_internal:subscription_succeeded", channel: msg.data.channel, data: "{}" }));
    for (const data of PAYLOADS) ws.send(JSON.stringify({ event: "evt", channel: msg.data.channel, data }));
  });
  const data = { socket_id: "1.1", activity_timeout: 120 };
  ws.send(JSON.stringify({ event: "pusher:connection_established", data: JSON.stringify(data) }));
});

function show(args: unknown[]): string {
  return args.length === 0 ? "(no argument)" : JSON.stringify(args[0]);
}

wss.on("listening", () => {
  const pusher = new Pusher("app-key", {
    cluster: "mt1",
    wsHost: "127.0.0.1",
    wsPort: (wss.address() as AddressInfo).port,
    forceTLS: false,
    enabledTransports: ["ws"],
    enableStats: false,
  });
  const viaPusher: string[] = [];
  const viaChannel: string[] = [];
  pusher.bind("evt", (...args: unknown[]) => viaPusher.push(show(args)));
  pusher.subscribe("room").bind("evt", (...args: unknown[]) => viaChannel.push(show(args)));

  setTimeout(() => {
    console.log(`channel.bind("evt") callback got: ${viaChannel.join(", ")}`);
    console.log(`pusher.bind("evt") callback got:  ${viaPusher.join(", ")}`);
    pusher.disconnect();
    wss.close();
    process.exit(0);
  }, 2000);
});
