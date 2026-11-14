// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import type { AddressInfo } from "node:net";
import Pusher from "pusher-js";
import { WebSocketServer } from "ws";

process.on("uncaughtException", (e) => console.log(`uncaught exception: ${e.message}`));

// A fake Pusher server (protocol 7). The first connection gets a pusher:error with "code": null
// as its first frame (the protocol makes the code optional). Each later connection gets a valid handshake.
let connections = 0;
let firstClosed = false;
const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
wss.on("connection", (ws) => {
  connections++;
  if (connections === 1) {
    ws.on("close", () => (firstClosed = true));
    ws.send(JSON.stringify({ event: "pusher:error", data: { code: null, message: "Something went wrong" } }));
  } else {
    const data = { socket_id: `${connections}.1`, activity_timeout: 120 };
    ws.send(JSON.stringify({ event: "pusher:connection_established", data: JSON.stringify(data) }));
  }
});

wss.on("listening", () => {
  const pusher = new Pusher("app-key", {
    cluster: "mt1",
    wsHost: "127.0.0.1",
    wsPort: (wss.address() as AddressInfo).port,
    forceTLS: false,
    enabledTransports: ["ws"],
    enableStats: false,
    unavailableTimeout: 2000,
  });
  pusher.connection.bind("state_change", (s: { previous: string; current: string }) =>
    console.log(`state: ${s.previous} -> ${s.current}`),
  );
  pusher.connection.bind("error", (e: { type: string }) => console.log(`error event: ${e.type}`));

  setTimeout(() => {
    console.log(
      `after 20 s: state=${pusher.connection.state}, server connections=${connections}, first socket closed=${firstClosed}`,
    );
    pusher.disconnect();
    wss.close();
    process.exit(0);
  }, 20000);
});
