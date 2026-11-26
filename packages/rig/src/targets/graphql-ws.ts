/**
 * The targets of `graphql-ws`: the server (`useServer` on a `ws` server) and the client (`createClient` on the
 * `WebSocket` of `ws`). PROTOCOL.md of graphql-transport-ws lets a client re-use an id after it completes the
 * operation. It lets no message of an operation cross after its `complete`.
 *
 * - A server case is outbound. A raw client sends `complete` for an operation, and the target records each message of
 *   the server for the id of that operation. An operation with the same id that comes later does not end in the time
 *   of the case. So each message for the id in that time comes from the completed operation.
 * - A client case is inbound. The scripted server of `@mark1russell7/rigor-testkit` sends a `next` after a `complete`,
 *   or after the `complete` of the caller. The target records each event of the sink.
 */
import { startScriptedServer, type WebSocketStep } from "@mark1russell7/rigor-testkit/http";
import { encodeWebSocketFrame } from "@mark1russell7/rigor-proxy/applier";
import { buildSchema } from "graphql";
import { createClient } from "graphql-ws";
import { useServer } from "graphql-ws/use/ws";
import { WebSocket, WebSocketServer } from "ws";
import type { SessionCase, SessionRun, SessionTarget } from "./target.ts";

/** The package and the version of the targets. The version is the version that the workspace installs. */
export const GRAPHQL_WS = { package: "graphql-ws", version: "6.4.3" } as const;

/** The subprotocol of graphql-transport-ws. */
const SUBPROTOCOL = "graphql-transport-ws";

/** This function waits for `ms` milliseconds. */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** One message of the protocol, with the fields that the targets read. */
interface WireMessage {
  readonly id?: string;
  readonly type: string;
  readonly payload?: { readonly data?: Record<string, unknown> | null };
}

/** The schema of the server: a slow query and a subscription that ticks. */
const schema = buildSchema("type Query { slow(ms: Int!): Int } type Subscription { ticks(ms: Int!): Int }");

/** The root values of the schema. */
const roots = {
  query: { slow: async ({ ms }: { ms: number }): Promise<number> => (await sleep(ms), ms) },
  subscription: {
    ticks: async function* ticks({ ms }: { ms: number }): AsyncGenerator<{ ticks: number }> {
      for (;;) {
        await sleep(ms);
        yield { ticks: ms };
      }
    },
  },
};

/** The time in ms of the record of a server case. The second operation of a case ends later than this time. */
const windowMs = 900;

/**
 * A server case. The control operation `c` is a fast query: its `next` is the item of the valid session. The
 * operation A has the id `1`. The client completes A at 50 ms. With a re-used id, the client starts the operation B
 * with the id `1` at 100 ms. B ends after the time of the case.
 */
async function runServer(one: SessionCase): Promise<SessionRun> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  const server = useServer({ schema, roots }, wss);
  await new Promise((resolve) => wss.once("listening", resolve));
  const socket = new WebSocket(`ws://127.0.0.1:${String((wss.address() as { port: number }).port)}`, SUBPROTOCOL);
  const received: WireMessage[] = [];
  socket.on("message", (data: Buffer) => received.push(JSON.parse(data.toString("utf8")) as WireMessage));
  try {
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    const send = (message: object): void => socket.send(JSON.stringify(message));
    send({ type: "connection_init" });
    await sleep(50);
    const subscription = one.variant.startsWith("subscription");
    const reused = one.variant.endsWith("id re-used");
    const start = Date.now();
    const at = (ms: number): Promise<void> => sleep(Math.max(0, ms - (Date.now() - start)));
    send({ type: "subscribe", id: "c", payload: { query: "{ slow(ms: 10) }" } });
    send({ type: "subscribe", id: "1", payload: { query: subscription ? "subscription { ticks(ms: 300) }" : "{ slow(ms: 300) }" } });
    await at(50);
    send({ type: "complete", id: "1" });
    if (reused) {
      await at(100);
      send({ type: "subscribe", id: "1", payload: { query: subscription ? "subscription { ticks(ms: 5000) }" : "{ slow(ms: 5000) }" } });
    }
    await at(windowMs);
    const kind = one.frame === "trailer" ? "complete" : "next";
    const text = (message: WireMessage): string => `${message.type} ${JSON.stringify(message.payload?.data ?? null)}`;
    return {
      before: received.filter((message) => message.id === "c" && message.type === "next").map(text),
      after: received.filter((message) => message.id === "1" && message.type === kind).map(text),
    };
  } finally {
    socket.terminate();
    await server.dispose();
    await new Promise((resolve) => wss.close(resolve));
  }
}

/** This function gives the text of a message of the server. */
const wire = (message: WireMessage): string => JSON.stringify(message);

/** This function gives a `next` for the id `1` with the value `value`. */
const next = (value: string): string => wire({ id: "1", type: "next", payload: { data: { v: value } } });

/** The `complete` of the server for the id `1`. */
const complete = wire({ id: "1", type: "complete" });

/** This function gives the text frames as the bytes of one write, so that the client reads them in one read. */
const oneRead = (...texts: string[]): Uint8Array => {
  const frames = texts.map((text) => encodeWebSocketFrame({ opcode: 1, payload: new TextEncoder().encode(text) }));
  const out = new Uint8Array(frames.reduce((sum, frame) => sum + frame.length, 0));
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
};

/** This function gives the steps of the scripted server after the `connection_ack` and the `subscribe` of the client. */
function stepsOf(one: SessionCase): WebSocketStep[] {
  if (one.after === "local close()") return [{ send: next("1") }, { receive: 3, limitMs: 2_000 }, { send: next("late"), delayMs: 20 }];
  const extra = one.frame === "trailer" ? complete : next("late");
  if (one.variant === "same read") return [{ raw: oneRead(next("1"), complete, extra) }];
  return [{ send: next("1") }, { send: complete, delayMs: 20 }, { send: extra, delayMs: 20 }];
}

/**
 * A client case. The caller subscribes with the id `1`. The sink records each event. A `next` with the value `late`
 * and each end event after the first are items after the end.
 */
async function runClient(one: SessionCase): Promise<SessionRun> {
  const steps: WebSocketStep[] = [{ receive: 1, limitMs: 2_000 }, { send: wire({ type: "connection_ack" }) }, { receive: 2, limitMs: 2_000 }, ...stepsOf(one)];
  const server = await startScriptedServer({ routes: [], webSockets: [{ path: "/graphql", sessions: [{ handshake: { protocol: SUBPROTOCOL }, steps }] }] });
  const client = createClient({ url: `${server.webSocketUrl}/graphql`, webSocketImpl: WebSocket, generateID: () => "1", retryAttempts: 0, lazy: true });
  const events: string[] = [];
  try {
    const unsubscribe = client.subscribe<{ v: string }>(
      { query: "subscription { v }" },
      {
        next: (value) => {
          events.push(`next ${String(value.data?.v)}`);
          if (value.data?.v === "1" && one.after === "local close()") unsubscribe();
        },
        error: (error: unknown) => events.push(`error ${error instanceof Error ? error.message : JSON.stringify(error)}`),
        complete: () => events.push("complete"),
      },
    );
    await sleep(300);
    const ends = events.filter((event) => !event.startsWith("next"));
    return {
      before: events.filter((event) => event === "next 1"),
      after: [...events.filter((event) => event === "next late"), ...ends.slice(1)],
    };
  } finally {
    await client.dispose();
    await server.close();
  }
}

/** The target of the server of `graphql-ws`. The variant names the operation and the re-use of its id. */
export const graphqlWsServerTarget: SessionTarget = {
  id: "graphql-ws/server",
  ...GRAPHQL_WS,
  format: "json-ws",
  cases: [
    { after: "completion of the peer", frame: "data", direction: "outbound", variant: "query, id re-used" },
    { after: "completion of the peer", frame: "trailer", direction: "outbound", variant: "query, id re-used" },
    { after: "completion of the peer", frame: "data", direction: "outbound", variant: "query, id not re-used" },
    { after: "completion of the peer", frame: "data", direction: "outbound", variant: "subscription, id re-used" },
    { after: "completion of the peer", frame: "data", direction: "outbound", variant: "subscription, id not re-used" },
  ],
  run: runServer,
};

/** The target of the client of `graphql-ws`. The variant tells if the frames after the end come in the same read. */
export const graphqlWsClientTarget: SessionTarget = {
  id: "graphql-ws/client",
  ...GRAPHQL_WS,
  format: "json-ws",
  cases: [
    { after: "completion of the peer", frame: "data", direction: "inbound", variant: "same read" },
    { after: "completion of the peer", frame: "data", direction: "inbound", variant: "later read" },
    { after: "completion of the peer", frame: "trailer", direction: "inbound", variant: "later read" },
    { after: "local close()", frame: "data", direction: "inbound", variant: "later read" },
  ],
  run: runClient,
};

/** The targets of `graphql-ws`. */
export const graphqlWsTargets: readonly SessionTarget[] = [graphqlWsServerTarget, graphqlWsClientTarget];
