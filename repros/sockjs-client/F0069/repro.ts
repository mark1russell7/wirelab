// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import http from "node:http";
import type { AddressInfo } from "node:net";
import sockjs from "sockjs";
import SockJS from "sockjs-client";

// a sockjs-node server that sends three messages when a client connects
const echo = sockjs.createServer({ log: () => {} });
echo.on("connection", (conn) => {
  conn.write("1");
  conn.write("2");
  conn.write("3");
});
const server = http.createServer();
echo.installHandlers(server, { prefix: "/echo" });

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address() as AddressInfo;
  const sock = new SockJS(`http://127.0.0.1:${port}/echo`, null, { transports: ["xhr-polling"] });
  sock.onmessage = (e) => {
    console.log(`message "${e.data}", readyState ${sock.readyState}`);
    if (e.data === "1") sock.close();
  };
  sock.onclose = (e) => {
    console.log(`close event: code ${e.code}`);
    server.closeAllConnections();
    server.close();
  };
});
