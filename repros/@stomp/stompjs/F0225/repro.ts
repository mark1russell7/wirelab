// Repro: @stomp/stompjs 7.5.0, frames whose subscription or receipt-id names an Object.prototype member are lost.
//
// The subscriptions and the receipt watchers are plain objects. A MESSAGE with
// subscription:constructor or a RECEIPT with receipt-id:toString finds an inherited
// function, so the frame goes to that function and not to onUnhandledMessage or
// onUnhandledReceipt.
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
    ws.send("CONNECTED\nversion:1.2\n\n\0");
    ws.send("MESSAGE\nsubscription:constructor\nmessage-id:1\n\nm1\0");
    ws.send("MESSAGE\nsubscription:no-such-sub\nmessage-id:2\n\nm2\0");
    ws.send("RECEIPT\nreceipt-id:toString\n\n\0");
    ws.send("RECEIPT\nreceipt-id:no-such-receipt\n\n\0");
  }
});
const messages: string[] = [];
const receipts: string[] = [];
const client = makeClient(server.url);
client.onUnhandledMessage = (m) => messages.push(m.body);
client.onUnhandledReceipt = (r) => receipts.push(r.headers["receipt-id"]!);
client.activate();
await sleep(400);
await client.deactivate({ force: true });
server.close();
console.log(`unhandled messages ${JSON.stringify(messages)}, unhandled receipts ${JSON.stringify(receipts)}`);
console.log(messages.includes("m1") && receipts.includes("toString") ? "BUG ABSENT" : "BUG PRESENT");
process.exit(0);
