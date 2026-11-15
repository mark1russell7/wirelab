// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { Manager } from "socket.io-client";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(delay: number) {
  console.log(`--- the server answers the CONNECT packet of /foo after ${delay} ms`);
  const httpServer = createServer();
  const server = new Server(httpServer);
  server
    .of("/foo")
    .use((_socket, next) => setTimeout(next, delay))
    .on("connection", (socket) => {
      console.log(`server: /foo connection ${socket.id}`);
      socket.on("disconnect", (reason) => console.log(`server: /foo ${socket.id} disconnect (${reason})`));
    });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address() as AddressInfo;

  const manager = new Manager(`http://127.0.0.1:${port}`, { transports: ["websocket"], reconnection: false });
  const root = manager.socket("/");
  await new Promise<void>((resolve) => root.once("connect", () => resolve()));

  const foo = manager.socket("/foo"); // the client sends the CONNECT packet of /foo
  foo.on("connect", () => console.log("client: /foo connect"));
  foo.disconnect(); // the server has not answered the CONNECT packet yet
  console.log(`client: /foo disconnect() called, connected: ${foo.connected}`);

  await sleep(delay + 1000);
  console.log(`sockets of /foo on the server ${delay + 1000} ms later: ${server.of("/foo").sockets.size}`);
  root.disconnect();
  await server.close();
}

await run(200);
await run(0);
process.exit(0);
