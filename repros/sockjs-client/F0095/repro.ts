// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import http from "node:http";
import type { AddressInfo } from "node:net";
import sockjs from "sockjs";

// A page that is still loading: a document with no body, and a window that keeps its load listeners, so the
// script can dispatch load. sockjs-client reads document when it loads, so the import comes after it.
type Listener = (event: { type: string }) => void;
const listeners: Record<string, Listener[]> = {};
const page = { body: null as object | null, readyState: "loading", domain: "localhost" };
Object.assign(globalThis, {
  document: page,
  addEventListener: (type: string, fn: Listener) => (listeners[type] ??= []).push(fn),
  removeEventListener: (type: string, fn: Listener) => {
    listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
  },
});
const { default: SockJS } = await import("sockjs-client");

const thrown: string[] = [];
process.on("uncaughtException", (err) => thrown.push(err.message));
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

// a sockjs-node server that records each request
const echo = sockjs.createServer({ log: () => {} });
const server = http.createServer();
echo.installHandlers(server, { prefix: "/echo" });
// installHandlers takes the request listeners that are on the server before it, so this listener comes after it
const requests: string[] = [];
server.on("request", (req: http.IncomingMessage) => {
  requests.push(`${req.method} ${(req.url ?? "").replace(/^\/echo\/[^/]+\/[^/]+\//, "/echo/<server>/<session>/")}`);
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

server.listen(0, "127.0.0.1", async () => {
  const { port } = server.address() as AddressInfo;
  const events: string[] = [];
  const sock = new SockJS(`http://127.0.0.1:${port}/echo`, null, { transports: ["xhr-streaming"] });
  sock.onopen = () => events.push("open");
  sock.onclose = (e) => events.push(`close ${e.code}`);
  // xhr-streaming needs the body, so after /info the client waits for load
  for (let i = 0; i < 100 && (listeners.load ?? []).length === 0; i++) await sleep(20);
  const loadListenersAtClose = (listeners.load ?? []).length;
  sock.close();
  await sleep(100);

  // the page ends loading
  const before = requests.length;
  page.body = {};
  page.readyState = "complete";
  for (const fn of (listeners.load ?? []).slice()) fn({ type: "load" });
  await sleep(1000);

  const actual = {
    loadListenersAtClose,
    requestsAfterLoad: requests.slice(before),
    thrown,
    events,
    loadListenersLeft: (listeners.load ?? []).length,
  };
  const expected = { loadListenersAtClose: 1, requestsAfterLoad: [], thrown: [], events: ["close 1000"], loadListenersLeft: 0 };
  console.log(`actual:   ${JSON.stringify(actual)}`);
  console.log(`expected: ${JSON.stringify(expected)}`);
  server.closeAllConnections();
  server.close();
  process.exit(JSON.stringify(actual) === JSON.stringify(expected) ? 0 : 1);
});
