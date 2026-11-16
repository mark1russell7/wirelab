// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import http from "node:http";
import type { AddressInfo } from "node:net";
import sockjs, { type Connection } from "sockjs";
import SockJS from "sockjs-client";

// A browser reports the exception of a listener and then calls the next listener (WHATWG DOM, "inner invoke").
// Node.js has no window error event, so the script records each report with process.on("uncaughtException").
const reported: string[] = [];
process.on("uncaughtException", (err) => reported.push(err.message));
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

// a sockjs-node server that sends the messages 1, 2 and 3 in one frame when a client connects
let conn: Connection | undefined;
const echo = sockjs.createServer({ log: () => {} });
echo.on("connection", (c) => {
  conn = c;
  c.write("1");
  c.write("2");
  c.write("3");
});
const server = http.createServer();
echo.installHandlers(server, { prefix: "/echo" });
// installHandlers takes the request listeners that are on the server before it, so this listener comes after it
const polls: string[] = [];
server.on("request", (req: http.IncomingMessage) => {
  if (/\/xhr$/.test((req.url ?? "").split("?")[0] ?? "")) polls.push(req.url ?? "");
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

server.listen(0, "127.0.0.1", async () => {
  const { port } = server.address() as AddressInfo;
  const sock = new SockJS(`http://127.0.0.1:${port}/echo`, null, { transports: ["xhr-polling"] });
  const onmessageGot: string[] = [];
  const otherListenerGot: string[] = [];
  const events: string[] = [];
  sock.onmessage = (e) => {
    onmessageGot.push(e.data);
    if (e.data === "1") throw new Error("app bug in onmessage");
  };
  sock.addEventListener("message", (e) => otherListenerGot.push(e.data));
  sock.onclose = (e) => events.push(`close ${e.code}`);

  await sleep(1000);
  const pollsBefore = polls.length;
  conn?.write("4"); // the next poll gets it
  await sleep(1500);

  const actual = {
    onmessageGot,
    otherListenerGot,
    reported,
    readyState: sock.readyState,
    events,
    pollsAfterTheMessage4: polls.length - pollsBefore,
  };
  const expected = {
    onmessageGot: ["1", "2", "3", "4"],
    otherListenerGot: ["1", "2", "3", "4"],
    reported: ["app bug in onmessage"],
    readyState: 1,
    events: [],
    pollsAfterTheMessage4: 1,
  };
  console.log(`actual:   ${JSON.stringify(actual)}`);
  console.log(`expected: ${JSON.stringify(expected)}`);
  sock.close();
  server.closeAllConnections();
  server.close();
  process.exit(JSON.stringify(actual) === JSON.stringify(expected) ? 0 : 1);
});
