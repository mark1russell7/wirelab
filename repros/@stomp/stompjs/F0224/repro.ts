// Repro: @stomp/stompjs 7.5.0, onHeartbeatLost runs again and again for one lost connection.
//
// When the incoming heartbeat check fails, the handler calls onHeartbeatLost and closes
// the socket, but it does not stop its interval. Until the close event comes (the close
// handshake of a dead link can take 30 s), each tick calls onHeartbeatLost again.
import { Client, type StompConfig } from "@stomp/stompjs";
import { WebSocket, WebSocketServer } from "ws";

// An in-process WebSocket server that answers the client frames.
function startServer(onFrame: (ws: WebSocket, frame: string) => void): Promise<{ url: string; close: () => void }> {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  wss.on("connection", (ws) => {
    let buf = "";
    ws.on("message", (data) => {
      buf += data.toString();
      let i: number;
      while ((i = buf.indexOf("\0")) >= 0) {
        const frame = buf.slice(0, i).replace(/^\n+/, "");
        buf = buf.slice(i + 1);
        onFrame(ws, frame);
      }
    });
  });
  return new Promise((resolve) =>
    wss.on("listening", () => {
      const { port } = wss.address() as { port: number };
      resolve({ url: `ws://127.0.0.1:${port}`, close: () => { for (const c of wss.clients) c.terminate(); wss.close(); } });
    }),
  );
}

function makeClient(url: string, conf: StompConfig = {}): Client {
  return new Client({
    webSocketFactory: () => new WebSocket(url, ["v12.stomp", "v11.stomp", "v10.stomp"]),
    reconnectDelay: 0,
    heartbeatIncoming: 0,
    heartbeatOutgoing: 0,
    ...conf,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const server = await startServer((ws, frame) => {
  if (frame.startsWith("CONNECT")) {
    // A dead peer: after CONNECTED it sends nothing and does not answer the close frame.
    ws.send("CONNECTED\nversion:1.2\nheart-beat:100,0\n\n\0", () => (ws as any)._socket.pause());
  }
});
let lost = 0;
let closed = 0;
const client = makeClient(server.url, { heartbeatIncoming: 100, heartbeatToleranceMultiplier: 2 });
client.onHeartbeatLost = () => lost++;
client.onWebSocketClose = () => closed++;
client.activate();
await sleep(1500);
console.log(`onHeartbeatLost calls in 1.5 s: ${lost}, onWebSocketClose calls: ${closed}`);
console.log(lost > 1 ? "BUG PRESENT" : "BUG ABSENT");
process.exit(0);
