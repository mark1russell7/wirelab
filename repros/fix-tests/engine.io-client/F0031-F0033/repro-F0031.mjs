import { createServer } from "node:http";
import { Socket, Fetch } from "engine.io-client";

// a server (or a proxy) which answers the POST requests, but never answers the long-polling GET request
const httpServer = createServer((req, res) => {
  if (req.method === "POST") {
    req.resume();
    return req.on("end", () => res.end("ok"));
  }
  if (!new URL(req.url, "http://x").searchParams.has("sid")) {
    return res.end('0{"sid":"abc","upgrades":[],"pingInterval":10000,"pingTimeout":5000,"maxPayload":1000000}');
  }
  console.log("server: long-polling request received (never answered)");
  res.on("close", () => console.log("server: long-polling request closed"));
});

httpServer.listen(0, "127.0.0.1", () => {
  const socket = new Socket(`http://127.0.0.1:${httpServer.address().port}`, { transports: [Fetch] });
  // close the socket while the long-polling request is pending
  socket.on("open", () => setTimeout(() => socket.close(), 100));
  socket.on("close", (reason) => console.log(`client: close "${reason}"`));

  setTimeout(() => {
    httpServer.getConnections((err, n) => {
      console.log(`after 2 s: open connections of the server: ${n}`);
      process.exit(0);
    });
  }, 2000);
});
