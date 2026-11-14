// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { Manager } from "socket.io-client";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The server answers the CONNECT packet of /delayed after 200 ms (an async auth check), and records each event.
const httpServer = createServer();
const server = new Server(httpServer);
const received: string[] = [];
server
  .of("/delayed")
  .use((_socket, next) => setTimeout(next, 200))
  .on("connection", (socket) => socket.onAny((event: string) => received.push(event)));

httpServer.listen(0, "127.0.0.1", async () => {
  const { port } = httpServer.address() as AddressInfo;
  const manager = new Manager(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
  const root = manager.socket("/");
  await new Promise<void>((resolve) => root.once("connect", () => resolve()));

  const delayed = manager.socket("/delayed"); // the client sends the CONNECT packet of /delayed
  await sleep(50);
  console.log(`transport writable: ${manager.engine.transport.writable}, namespace connected: ${delayed.connected}`);
  delayed.volatile.emit("volatile-event");
  delayed.emit("normal-event");

  await sleep(1000);
  console.log(`events received by the server on /delayed: ${JSON.stringify(received)}`);
  process.exit(0);
});
