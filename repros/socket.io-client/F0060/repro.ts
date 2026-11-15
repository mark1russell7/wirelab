// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io } from "socket.io-client";

// The server does not use connection state recovery.
const httpServer = createServer();
new Server(httpServer);

httpServer.listen(0, "127.0.0.1", () => {
  const { port } = httpServer.address() as AddressInfo;
  const socket = io(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
  console.log(`before the connection: recovered = ${socket.recovered} (${typeof socket.recovered})`);
  socket.on("connect", () => {
    console.log(`after the connection: recovered = ${socket.recovered} (${typeof socket.recovered})`);
    process.exit(0);
  });
});
