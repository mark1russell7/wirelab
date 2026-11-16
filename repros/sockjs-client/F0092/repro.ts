// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import http from "node:http";
import type { AddressInfo } from "node:net";
import sockjs from "sockjs";
import SockJS from "sockjs-client";

// WHATWG WebSockets, close(code, reason): if code is present and is not 1000 or in 3000 to 4999, throw an
// InvalidAccessError. The type of code is [Clamp] unsigned short, so NaN becomes 0.
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

// a sockjs-node server
const echo = sockjs.createServer({ log: () => {} });
const server = http.createServer();
echo.installHandlers(server, { prefix: "/echo" });

function tryClose(sock: { close(code?: number): void }, code: number): string {
  try {
    sock.close(code);
    return "no throw";
  } catch (e) {
    return /InvalidAccessError/.test(String(e)) ? "throws InvalidAccessError" : `throws ${String(e)}`;
  }
}

server.listen(0, "127.0.0.1", async () => {
  const { port } = server.address() as AddressInfo;
  const actual: Record<string, string> = {};
  for (const code of [0, NaN]) {
    actual[`SockJS close(${code})`] = await new Promise<string>((resolve) => {
      const sock = new SockJS(`http://127.0.0.1:${port}/echo`, null, { transports: ["websocket"] });
      sock.onopen = () => {
        const result = tryClose(sock, code);
        if (sock.readyState === SockJS.OPEN) sock.close(); // close(code) threw, so the socket is still open
        sock.onclose = (e) => resolve(result === "no throw" ? `no throw, close event code ${e.code}` : result);
      };
    });
  }
  // the native WebSocket of Node.js, on the raw WebSocket endpoint of the same server
  const native = await new Promise<string[]>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/echo/websocket`);
    ws.onopen = () => {
      const results = [tryClose(ws, 0), tryClose(ws, NaN)];
      ws.close();
      resolve(results);
    };
    ws.onerror = () => resolve(["error event", "error event"]);
  });
  actual["WebSocket close(0)"] = native[0] ?? "";
  actual["WebSocket close(NaN)"] = native[1] ?? "";

  const expected = {
    "SockJS close(0)": "throws InvalidAccessError",
    "SockJS close(NaN)": "throws InvalidAccessError",
    "WebSocket close(0)": "throws InvalidAccessError",
    "WebSocket close(NaN)": "throws InvalidAccessError",
  };
  console.log(`actual:   ${JSON.stringify(actual)}`);
  console.log(`expected: ${JSON.stringify(expected)}`);
  server.closeAllConnections();
  server.close();
  process.exit(JSON.stringify(actual) === JSON.stringify(expected) ? 0 : 1);
});
