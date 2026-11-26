// graphql-ws 6.4.3, the client. On a "complete" from the server, the listener of the id sets `done` and calls the
// releaser. The listener stays until `unlisten` runs in a `.finally`, after microtasks. Its "next" branch does not
// examine `done`. The `ws` client gives each frame of one read in one task (allowSynchronousEvents), so a "next" in
// the same read as the "complete" reaches sink.next(). The server here writes the three frames in one write.
import { createClient } from "graphql-ws";
import { WebSocket, WebSocketServer } from "ws";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// A text frame of a server: no mask, and a payload of less than 126 bytes.
const frame = (text: string) => Buffer.concat([Buffer.from([0x81, Buffer.byteLength(text)]), Buffer.from(text)]);
const next = (v: string) => JSON.stringify({ id: "1", type: "next", payload: { data: { v } } });

const wss = new WebSocketServer({ port: 0, handleProtocols: () => "graphql-transport-ws" });
wss.on("connection", (socket) => {
  socket.on("message", (data) => {
    const message = JSON.parse(String(data));
    if (message.type === "connection_init") socket.send(JSON.stringify({ type: "connection_ack" }));
    if (message.type === "subscribe") {
      const raw = (socket as unknown as { _socket: { write(b: Buffer): void } })._socket;
      raw.write(Buffer.concat([frame(next("1")), frame(JSON.stringify({ id: "1", type: "complete" })), frame(next("late"))]));
    }
  });
});
await new Promise((r) => wss.once("listening", r));

const client = createClient({
  url: `ws://127.0.0.1:${(wss.address() as { port: number }).port}`,
  webSocketImpl: WebSocket,
  generateID: () => "1",
  retryAttempts: 0,
});
const events: string[] = [];
client.subscribe<{ v: string }>(
  { query: "subscription { v }" },
  { next: (value) => events.push(`next ${value.data?.v}`), error: () => events.push("error"), complete: () => events.push("complete") },
);
await sleep(300);
for (const e of events) console.log(`sink: ${e}`);
const bug = events.includes("next late");
console.log('expected: "next 1", then "complete". The "next" after the "complete" of the server does not reach the sink.');
console.log(bug ? "BUG PRESENT (the sink got the next after the complete)" : "BUG ABSENT");
process.exitCode = bug ? 1 : 0;
await client.dispose();
wss.close();
