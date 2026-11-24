// graphql-ws 6.4.3. PROTOCOL.md: "Once a client completes an operation, it is free to re-use that ID." The server
// keeps one reservation for each id (ctx.subscriptions[id]), and each operation deletes ctx.subscriptions[id] in a
// finally block when it ends. So when a client completes operation A and starts operation B with the same id, A
// still runs. When A ends, it finds the reservation of B, sends its own result with the id, completes the id, and
// deletes the reservation of B. The result of B never comes.
import { buildSchema } from "graphql";
import { useServer } from "graphql-ws/use/ws";
import { WebSocket, WebSocketServer } from "ws";

const schema = buildSchema("type Query { slow(ms: Int!): Int }");
const roots = { query: { slow: async ({ ms }: { ms: number }) => (await new Promise((r) => setTimeout(r, ms)), ms) } };
const wss = new WebSocketServer({ port: 0 });
useServer({ schema, roots }, wss);
await new Promise((r) => wss.once("listening", r));

const socket = new WebSocket(`ws://127.0.0.1:${(wss.address() as { port: number }).port}`, "graphql-transport-ws");
const received: string[] = [];
socket.on("message", (data) => received.push(String(data)));
await new Promise((r) => socket.once("open", r));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
socket.send(JSON.stringify({ type: "connection_init" }));
await sleep(100);
const start = Date.now();
const at = (ms: number) => sleep(Math.max(0, ms - (Date.now() - start)));

socket.send(JSON.stringify({ type: "subscribe", id: "1", payload: { query: "{ slow(ms: 300) }" } })); // operation A
await at(50);
socket.send(JSON.stringify({ type: "complete", id: "1" })); // the client cancels A
await at(100);
socket.send(JSON.stringify({ type: "subscribe", id: "1", payload: { query: "{ slow(ms: 600) }" } })); // operation B, same id
await at(1200);

const results = received.map((m) => JSON.parse(m)).filter((m) => m.type !== "connection_ack");
for (const m of results) console.log(`received: ${JSON.stringify(m)}`);
const next = results.filter((m) => m.type === "next").map((m) => m.payload.data.slow);
const bug = next.length !== 1 || next[0] !== 600;
console.log('expected: one "next" with {"slow":600} (operation B), then "complete". Operation A was completed by the client.');
console.log(bug ? `BUG PRESENT (the results for id 1 are [${next.join(", ")}])` : "BUG ABSENT");
process.exitCode = bug ? 1 : 0;
socket.terminate();
wss.close();
