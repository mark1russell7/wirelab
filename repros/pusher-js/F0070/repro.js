// npm install, then: node repro.js
const { WebSocketServer } = require("ws");
const Pusher = require("pusher-js");

// A fake Pusher server (protocol 7). The first connection gets a connection_established event
// with no activity_timeout, so the handshake is invalid. Each later connection gets a valid one.
let connections = 0;
const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
wss.on("connection", (ws) => {
  connections++;
  const data = connections === 1 ? { socket_id: "1.1" } : { socket_id: `${connections}.1`, activity_timeout: 120 };
  ws.send(JSON.stringify({ event: "pusher:connection_established", data: JSON.stringify(data) }));
});

wss.on("listening", () => {
  const pusher = new Pusher("app-key", {
    cluster: "mt1",
    wsHost: "127.0.0.1",
    wsPort: wss.address().port,
    forceTLS: false,
    enabledTransports: ["ws"],
    enableStats: false,
    unavailableTimeout: 2000,
  });
  pusher.connection.bind("state_change", (s) => console.log(`state: ${s.previous} -> ${s.current}`));
  pusher.connection.bind("error", (e) => console.log(`error event: ${e.type}`));

  setTimeout(() => {
    console.log(`after 20 s: state=${pusher.connection.state}, server connections=${connections}`);
    pusher.disconnect();
    wss.close();
    process.exit(0);
  }, 20000);
});
