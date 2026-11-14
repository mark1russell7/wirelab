// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import type { AddressInfo } from "node:net";
import Pusher from "pusher-js";
import { WebSocketServer } from "ws";

// A fake Pusher server (protocol 7). It closes the first connection with the code 4100
// ("over capacity, reconnect after a back-off").
let connections = 0;
const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
wss.on("connection", (ws) => {
  connections++;
  const data = { socket_id: `${connections}.1`, activity_timeout: 120 };
  ws.send(JSON.stringify({ event: "pusher:connection_established", data: JSON.stringify(data) }));
  if (connections === 1) setTimeout(() => ws.close(4100, "Over capacity"), 200);
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
  pusher.connection.bind("state_change", (s: { previous: string; current: string }) =>
    console.log(`state: ${s.previous} -> ${s.current}`),
  );
  let asked = false;
  pusher.connection.bind("connecting_in", (delay: number) => {
    console.log(`connecting_in: ${delay} s`);
    if (asked) return;
    asked = true;
    // The client waits 1 s before it connects again. The app disconnects in that second.
    setTimeout(() => {
      console.log("the app calls disconnect()");
      pusher.disconnect();
    }, 100);
  });

  setTimeout(() => {
    console.log(`after 3 s: state=${pusher.connection.state}, server connections=${connections}`);
    pusher.disconnect();
    wss.close();
    process.exit(0);
  }, 3000);
});
