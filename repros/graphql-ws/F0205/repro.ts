// graphql-ws 6.4.3. client.iterate() gives an async iterator with its own throw() and return(). return() calls the
// dispose function of the subscription, so the client sends "complete" and releases the connection. throw() only
// marks the iterator as done: the subscription stays active on the server, the server keeps sending values, the
// client keeps them in a list that nobody reads, and the lazy connection stays open.
import { buildSchema } from "graphql";
import { createClient } from "graphql-ws";
import { useServer } from "graphql-ws/use/ws";
import { WebSocket, WebSocketServer } from "ws";

const schema = buildSchema("type Query { hi: String } type Subscription { tick: Int }");
let active = 0;
let sent = 0;
const roots = {
  query: { hi: () => "hi" },
  subscription: {
    tick: async function* () {
      active += 1;
      try {
        for (let i = 0; ; i++) {
          sent += 1;
          yield { tick: i };
          await new Promise((r) => setTimeout(r, 20));
        }
      } finally {
        active -= 1;
      }
    },
  },
};
const wss = new WebSocketServer({ port: 0 });
useServer({ schema, roots }, wss);
await new Promise((r) => wss.once("listening", r));
const url = `ws://127.0.0.1:${(wss.address() as { port: number }).port}`;

let bug = false;
for (const method of ["return", "throw"] as const) {
  const client = createClient({ url, webSocketImpl: WebSocket, lazyCloseTimeout: 0 });
  const iterator = client.iterate({ query: "subscription { tick }" });
  await iterator.next();
  const result = method === "return" ? await iterator.return!() : await iterator.throw!(new Error("stop"));
  const before = sent;
  await new Promise((r) => setTimeout(r, 500));
  const open = [...wss.clients].filter((s) => s.readyState === WebSocket.OPEN).length;
  const wrong = active > 0 || open > 0;
  if (wrong) bug = true;
  console.log(`${method}() gave ${JSON.stringify(result)}; 500 ms later: active subscriptions on the server ${active}, values sent ${sent - before}, open sockets ${open}${wrong ? "  <- WRONG" : ""}`);
  await client.dispose();
  for (const s of wss.clients) s.terminate();
  await new Promise((r) => setTimeout(r, 100));
}
console.log("expected: after throw(), as after return(), the subscription ends on the server and the socket closes");
console.log(bug ? "BUG PRESENT" : "BUG ABSENT");
process.exitCode = bug ? 1 : 0;
wss.close();
