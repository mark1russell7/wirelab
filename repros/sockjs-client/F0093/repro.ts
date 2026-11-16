// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import http from "node:http";
import type { AddressInfo } from "node:net";

// A page that a browser loaded over https. sockjs-client reads location when it loads, so the import comes after it.
// Secure Contexts, "Is origin potentially trustworthy?": 127.0.0.0/8, ::1, localhost and *.localhost are trustworthy,
// so Mixed Content does not block ws: or http: to them. A browser allows new WebSocket("ws://localhost:8080/").
Object.assign(globalThis, {
  location: {
    protocol: "https:",
    href: "https://app.example/",
    host: "app.example",
    hostname: "app.example",
    port: "",
    hash: "",
    origin: "https://app.example",
    pathname: "/",
    search: "",
  },
});
const { default: SockJS } = await import("sockjs-client");

// a server that answers 404 to each request
const server = http.createServer((_req, res) => {
  res.writeHead(404);
  res.end();
});

server.listen(0, "127.0.0.1", async () => {
  const { port } = server.address() as AddressInfo;
  const actual: Record<string, string> = {};
  for (const host of ["127.0.0.1", "[::1]", "localhost", "app.localhost", "insecure.example"]) {
    try {
      const sock = new SockJS(`http://${host}:${port}/echo`);
      sock.onclose = () => {};
      sock.close();
      actual[host] = "allowed";
    } catch (e) {
      actual[host] = /SecurityError/.test(String(e)) ? "throws SecurityError" : `throws ${String(e)}`;
    }
  }
  const expected = {
    "127.0.0.1": "allowed",
    "[::1]": "allowed",
    localhost: "allowed",
    "app.localhost": "allowed",
    "insecure.example": "throws SecurityError",
  };
  console.log(`actual:   ${JSON.stringify(actual)}`);
  console.log(`expected: ${JSON.stringify(expected)}`);
  await new Promise((resolve) => setTimeout(resolve, 200));
  server.closeAllConnections();
  server.close();
  process.exit(JSON.stringify(actual) === JSON.stringify(expected) ? 0 : 1);
});
