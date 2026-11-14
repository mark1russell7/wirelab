// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { Manager } from "socket.io-client";

async function run(transport: "websocket" | "polling") {
  console.log(`--- transport: ${transport}`);
  const httpServer = createServer();
  const server = new Server(httpServer);
  server.of("/foo").on("connection", (socket) => {
    console.log(`server: /foo connection ${socket.id}`);
    socket.on("disconnect", (reason) => console.log(`server: /foo ${socket.id} disconnect (${reason})`));
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address() as AddressInfo;

  const manager = new Manager(`http://127.0.0.1:${port}`, { transports: [transport], reconnection: false });
  const root = manager.socket("/");
  root.on("disconnect", (reason) => console.log(`client: / disconnect (${reason})`));
  await new Promise((resolve) => root.once("connect", resolve));

  const foo = manager.socket("/foo"); // the client sends the CONNECT packet of /foo
  foo.connect(); // the server has not answered the CONNECT packet yet
  foo.on("connect", () => console.log(`client: /foo connect ${foo.id}`));
  foo.on("disconnect", (reason) => console.log(`client: /foo disconnect (${reason})`));

  await new Promise((resolve) => setTimeout(resolve, 1500));
  console.log(`sockets of /foo on the server: ${server.of("/foo").sockets.size}, client /foo connected: ${foo.connected}`);
  foo.disconnect();
  root.disconnect();
  await server.close();
}

await run("websocket");
await run("polling");
process.exit(0);
