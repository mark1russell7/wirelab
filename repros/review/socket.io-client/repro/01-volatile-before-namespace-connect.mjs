// F0055: a volatile event that is emitted while the namespace is not connected yet.
// The documentation says that a volatile event "will be dropped when this socket is not ready to send messages".
// The server delays the CONNECT reply of /delayed by 200 ms. The client emits a volatile event and a normal event
// 50 ms after it opens the namespace: the transport is writable, but the namespace is not connected.
import { Manager } from "socket.io-client";
import { startServer, sleep, versions } from "./lib/server.mjs";

console.log(await versions("socket.io-client", "socket.io"));
const received = [];
const srv = await startServer({}, (server) => {
  server
    .of("/delayed")
    .use((socket, next) => setTimeout(next, 200))
    .on("connection", (socket) => socket.onAny((event) => received.push(event)));
});

const manager = new Manager(srv.url, { transports: ["websocket"], reconnection: false });
const root = manager.socket("/");
await new Promise((resolve) => root.once("connect", resolve));

const delayed = manager.socket("/delayed");
await sleep(50);
console.log(`transport writable: ${manager.engine.transport.writable}, namespace connected: ${delayed.connected}`);
delayed.volatile.emit("volatile-event");
delayed.emit("normal-event");

await sleep(1000);
console.log(`events that the server received on /delayed: ${JSON.stringify(received)}`);
const fault = received.includes("volatile-event");
console.log(
  fault
    ? "FAULT: the client buffered the volatile event and sent it after the namespace connected"
    : "OK: the client dropped the volatile event",
);
delayed.disconnect();
root.disconnect();
await srv.close();
process.exit(fault ? 1 : 0);
