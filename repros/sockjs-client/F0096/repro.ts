// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import http from "node:http";
import type { AddressInfo } from "node:net";
import SockJS from "sockjs-client";

// Each transport attempt starts its own timer of about 2 x RTO (about 610 ms here). The websocket attempt fails
// after 400 ms. The xhr-polling attempt then gets the open frame 300 ms after its request, in its own time.
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

const t0 = Date.now();
const log: string[] = [];
const server = http.createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0] ?? "";
  log.push(`${Date.now() - t0}ms ${req.method} ${path}`);
  if (path === "/echo/info") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ websocket: true, cookie_needed: false, origins: ["*:*"], entropy: 1 }));
  } else if (path.endsWith("/xhr")) {
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end("o\n");
    }, 300);
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.on("upgrade", (req, socket) => {
  log.push(`${Date.now() - t0}ms UPGRADE ${req.url}`);
  setTimeout(() => socket.destroy(), 400); // the websocket attempt fails after 400 ms
});

server.listen(0, "127.0.0.1", async () => {
  const { port } = server.address() as AddressInfo;
  const result = await new Promise<string>((resolve) => {
    const sock = new SockJS(`http://127.0.0.1:${port}/echo`, null, { transports: ["websocket", "xhr-polling"] });
    sock.onopen = () => {
      const transport = String(Reflect.get(sock, "transport")); // SockJS sets transport, and its types do not declare it
      sock.close();
      resolve(`open via ${transport}`);
    };
    sock.onclose = (e) => resolve(`close ${e.code} "${e.reason}" at ${Date.now() - t0}ms`);
  });
  console.log(`server: ${JSON.stringify(log)}`);
  console.log(`actual:   ${result}`);
  console.log("expected: open via xhr-polling");
  await new Promise((resolve) => setTimeout(resolve, 50));
  server.closeAllConnections();
  server.close();
  process.exit(result === "open via xhr-polling" ? 0 : 1);
});
