// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import sockjs from "sockjs";
import SockJS from "sockjs-client";

// The server stops with no SockJS close frame, as a crash or a reset of a proxy does: it destroys each TCP connection.
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 30000).unref();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function trial(transport: string): Promise<{ readyState: number; events: string[] }> {
  // a sockjs-node echo server
  const echo = sockjs.createServer({ log: () => {} });
  echo.on("connection", (conn) => conn.on("data", (d) => conn.write(d)));
  const server = http.createServer();
  echo.installHandlers(server, { prefix: "/echo" });
  const sockets = new Set<Socket>();
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const sock = new SockJS(`http://127.0.0.1:${port}/echo`, null, { transports: [transport] });
  await new Promise((resolve) => (sock.onopen = resolve));
  const events: string[] = [];
  sock.onclose = (e) => events.push(`close ${e.code}`);
  await sleep(300); // xhr-polling starts its next poll
  for (const s of sockets) s.destroy();
  server.close();
  await sleep(3000);
  const out = { readyState: sock.readyState, events: [...events] };
  if (sock.readyState === SockJS.OPEN) sock.close();
  return out;
}

const actual: Record<string, { readyState: number; events: string[] }> = {};
for (const transport of ["websocket", "xhr-streaming", "xhr-polling"]) actual[transport] = await trial(transport);
const closed = { readyState: 3, events: ["close 1006"] };
const expected = { websocket: closed, "xhr-streaming": closed, "xhr-polling": closed };
console.log(`actual:   ${JSON.stringify(actual)}`);
console.log(`expected: ${JSON.stringify(expected)}`);
process.exit(JSON.stringify(actual) === JSON.stringify(expected) ? 0 : 1);
