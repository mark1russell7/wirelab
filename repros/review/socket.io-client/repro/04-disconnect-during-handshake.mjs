// F0058: socket.disconnect() while the CONNECT packet of the namespace is not acknowledged yet.
// The argument is the delay in ms of the CONNECT reply of /foo on the server (an async auth check). Default 200.
// The client opens /foo and calls disconnect() at once. The repro counts the sockets of /foo on the server.
import { Manager } from "socket.io-client";
import { startServer, sleep, versions } from "./lib/server.mjs";

const delay = Number(process.argv[2] ?? 200);
console.log(`${await versions("socket.io-client", "socket.io")}, delay of the CONNECT reply ${delay} ms`);
const events = [];
const srv = await startServer({}, (server) => {
  server
    .of("/foo")
    .use((socket, next) => (delay > 0 ? setTimeout(next, delay) : next()))
    .on("connection", (socket) => {
      events.push(`server: /foo connection ${socket.id}`);
      socket.on("disconnect", (reason) => events.push(`server: /foo ${socket.id} disconnected (${reason})`));
    });
});

const manager = new Manager(srv.url, { transports: ["websocket"], reconnection: false });
const root = manager.socket("/");
await new Promise((resolve) => root.once("connect", resolve));

const foo = manager.socket("/foo");
foo.on("connect", () => events.push("client: /foo connected"));
foo.disconnect();
events.push(`client: /foo disconnect() called, connected ${foo.connected}, active ${foo.active}`);

await sleep(delay + 1000);
for (const e of events) console.log(e);
const serverSockets = srv.server.of("/foo").sockets.size;
console.log(`sockets of /foo on the server ${delay + 1000} ms later: ${serverSockets}, client / connected: ${root.connected}`);
const fault = serverSockets > 0;
console.log(fault ? "FAULT: the server keeps a socket that the client closed" : "OK: the server has no socket of /foo");
root.disconnect();
await srv.close();
process.exit(fault ? 1 : 0);
