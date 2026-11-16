// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import http from "node:http";
import type { AddressInfo } from "node:net";
import SockJS from "sockjs-client";

// The README of sockjs-client: "url may contain a query string, if one is desired."
// RFC 3986, section 3.4: a query can contain "?". Here the value of next is /home?tab=2.
const query = "?next=/home?tab=2&token=abc";
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

// a server that records the URL of each request, answers /info, gives the open frame on the first poll and
// keeps the next polls open
const urls: string[] = [];
let polls = 0;
const server = http.createServer((req, res) => {
  urls.push(`${req.method} ${req.url}`);
  const path = (req.url ?? "").split("?")[0] ?? "";
  if (path === "/echo/info") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ websocket: false, cookie_needed: false, origins: ["*:*"], entropy: 1 }));
  } else if (path.endsWith("/xhr")) {
    polls += 1;
    if (polls === 1) {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end("o\n");
    }
  } else if (path.endsWith("/xhr_send")) {
    res.writeHead(204);
    res.end();
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(0, "127.0.0.1", async () => {
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => {
    const sock = new SockJS(`http://127.0.0.1:${port}/echo${query}`, null, { transports: ["xhr-polling"] });
    sock.onopen = () => {
      sock.send("x");
      setTimeout(() => sock.close(), 300);
    };
    sock.onclose = () => resolve();
  });
  const actual = urls.map((u) => u.replace(/\/echo\/[^/?]+\/[^/?]+\//, "/echo/<server>/<session>/"));
  const expected = actual.map((u) => u.replace(/\?.*$/, "") + query);
  console.log(`actual:   ${JSON.stringify(actual)}`);
  console.log(`expected: ${JSON.stringify(expected)}`);
  server.closeAllConnections();
  server.close();
  process.exit(actual.length >= 3 && JSON.stringify(actual) === JSON.stringify(expected) ? 0 : 1);
});
