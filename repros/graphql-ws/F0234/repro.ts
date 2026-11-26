// graphql-ws 6.4.3. PROTOCOL.md, Complete from the client: "No further events, relevant to the original subscription,
// should be sent through." On a client Complete, the server deletes ctx.subscriptions[id] and calls return() on the
// subscription. When the source is an async generator that waits in an `await`, return() waits until the generator
// yields. The `for await` loop of the server asked for the next value first, so it gets one more value. The loop calls
// emit.next() with no check of ctx.subscriptions, so the server sends that value as a "next" for the completed id.
// No re-used id is necessary (compare F0204).
import { buildSchema } from "graphql";
import { useServer } from "graphql-ws/use/ws";
import { WebSocket, WebSocketServer } from "ws";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const schema = buildSchema("type Query { ok: Int } type Subscription { ticks(ms: Int!): Int }");
const roots = {
  subscription: {
    ticks: async function* ({ ms }: { ms: number }) {
      for (;;) {
        await sleep(ms); // a source that waits for its next event, as a poll or a timer does
        yield { ticks: ms };
      }
    },
  },
};
const wss = new WebSocketServer({ port: 0 });
useServer({ schema, roots }, wss);
await new Promise((r) => wss.once("listening", r));

const socket = new WebSocket(`ws://127.0.0.1:${(wss.address() as { port: number }).port}`, "graphql-transport-ws");
const received: string[] = [];
socket.on("message", (data) => received.push(String(data)));
await new Promise((r) => socket.once("open", r));
socket.send(JSON.stringify({ type: "connection_init" }));
await sleep(100);

socket.send(JSON.stringify({ type: "subscribe", id: "1", payload: { query: "subscription { ticks(ms: 300) }" } }));
await sleep(50);
socket.send(JSON.stringify({ type: "complete", id: "1" })); // the client completes the subscription before its first event
await sleep(900);

const results = received.map((m) => JSON.parse(m)).filter((m) => m.type !== "connection_ack");
for (const m of results) console.log(`received: ${JSON.stringify(m)}`);
const bug = results.some((m) => m.id === "1");
console.log('expected: no message for id 1 after the "complete" of the client.');
console.log(bug ? `BUG PRESENT (${results.filter((m) => m.id === "1").length} message(s) for id 1 after the complete)` : "BUG ABSENT");
process.exitCode = bug ? 1 : 0;
socket.terminate();
wss.close();
