// F0057: socket.connect() while the CONNECT packet of the namespace is not acknowledged yet.
// The argument is the transport: websocket (the default) or polling.
// The repro counts the CONNECT packets that the client sends, the sockets of /foo on the server, and the
// disconnections on both sides.
import { Manager } from "socket.io-client";
import { startServer, sleep, versions } from "./lib/server.mjs";

const transport = process.argv[2] ?? "websocket";
console.log(`${await versions("socket.io-client", "socket.io")}, transport ${transport}`);
const events = [];
const srv = await startServer({}, (server) => {
  server.engine.on("connection", (conn) => conn.on("close", (reason) => events.push(`server: connection closed (${reason})`)));
  server.of("/foo").on("connection", (socket) => {
    events.push(`server: /foo connection ${socket.id}`);
    socket.on("disconnect", (reason) => events.push(`server: /foo ${socket.id} disconnected (${reason})`));
  });
});

const manager = new Manager(srv.url, { transports: [transport], reconnection: false });
const root = manager.socket("/");
root.on("disconnect", (reason) => events.push(`client: / disconnected (${reason})`));
await new Promise((resolve) => root.once("connect", resolve));

const connectPackets = [];
const packet = manager._packet.bind(manager);
manager._packet = (p) => {
  if (p.type === 0) connectPackets.push(p.nsp);
  packet(p);
};

const foo = manager.socket("/foo");
foo.connect();
foo.on("connect", () => events.push(`client: /foo connected ${foo.id}`));
foo.on("disconnect", (reason) => events.push(`client: /foo disconnected (${reason})`));

await sleep(1500);
console.log(`CONNECT packets that the client sent: ${JSON.stringify(connectPackets)}`);
for (const e of events) console.log(e);
const serverSockets = srv.server.of("/foo").sockets.size;
console.log(`sockets of /foo on the server: ${serverSockets}, client / connected: ${root.connected}, client /foo connected: ${foo.connected}`);
const fault = connectPackets.length > 1;
console.log(fault ? "FAULT: the client sent a second CONNECT packet" : "OK: the client sent one CONNECT packet");
foo.disconnect();
root.disconnect();
await srv.close();
process.exit(fault ? 1 : 0);
