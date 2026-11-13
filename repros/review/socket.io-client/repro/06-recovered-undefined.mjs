// F0060: socket.recovered with a server that does not use connection state recovery. The type of the field is boolean.
import { io } from "socket.io-client";
import { startServer, versions } from "./lib/server.mjs";

console.log(await versions("socket.io-client", "socket.io"));
const srv = await startServer();
const socket = io(srv.url, { transports: ["websocket"], reconnection: false });
console.log(`before the connection: recovered ${socket.recovered} (${typeof socket.recovered})`);
await new Promise((resolve) => socket.once("connect", resolve));
console.log(`after the connection: recovered ${socket.recovered} (${typeof socket.recovered})`);
const fault = socket.recovered !== false;
console.log(fault ? "FAULT: socket.recovered is not a boolean" : "OK: socket.recovered is false");
socket.disconnect();
await srv.close();
process.exit(fault ? 1 : 0);
