// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import type { AddressInfo } from "node:net";
import Pusher from "pusher-js";
import { WebSocketServer } from "ws";

// A fake Pusher server (protocol 7). It drops the first connection with no close frame.
let connections = 0;
const closeCodes: number[] = [];
const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
wss.on("connection", (ws) => {
  const index = ++connections;
  ws.on("close", (code) => {
    if (index > 1) closeCodes.push(code);
  });
  const data = { socket_id: `${index}.1`, activity_timeout: 120 };
  ws.send(JSON.stringify({ event: "pusher:connection_established", data: JSON.stringify(data) }));
  if (index === 1) setTimeout(() => ws.terminate(), 200);
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
    // The client waits 1 s before it connects again. The app calls connect() in that second.
    setTimeout(() => {
      console.log("the app calls connect()");
      pusher.connect();
    }, 100);
  });

  setTimeout(() => {
    console.log(`after 3 s: state=${pusher.connection.state}, server connections=${connections}`);
    console.log(`close codes of the later connections: [${closeCodes.join(", ")}]`);
    pusher.disconnect();
    wss.close();
    process.exit(0);
  }, 3000);
});
