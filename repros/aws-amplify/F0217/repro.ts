// aws-amplify 6.22.2 (@aws-amplify/api-graphql 4.10.2). When the connection_ack of a real-time WebSocket does not come
// within 15 s, the provider opens a new socket but does not close the first one. The handlers of the first socket act
// on the provider: when the first socket closes later, its onclose clears the keep-alive interval of the new socket
// and records CLOSED. The Hub then reports Disconnected while the new socket delivers data, and a silent new socket is
// never detected. The repro uses a fake WebSocket and the real timers, and runs about 36 s.
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/api";
import { Hub } from "aws-amplify/utils";

type Message = { type: string; id?: string; payload?: unknown };

const sockets: FakeWebSocket[] = [];
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = 0;
  sent: Message[] = [];
  closedByClient = false;
  onopen: ((event: object) => void) | null = null;
  onclose: ((event: object) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: object) => void) | null = null;
  constructor() {
    sockets.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.({});
    }, 0);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Message);
  }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.closedByClient = true;
  }
  receive(message: Message): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}
(globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;

Amplify.configure({
  API: {
    GraphQL: {
      endpoint: "https://abcdefghijklmnopqrstuvwxyz.appsync-api.us-east-1.amazonaws.com/graphql",
      region: "us-east-1",
      defaultAuthMode: "apiKey",
      apiKey: "da2-fake",
    },
  },
});
const states: string[] = [];
Hub.listen("api", ({ payload }) => {
  if (payload.event === "ConnectionStateChange") {
    states.push((payload.data as { connectionState: string }).connectionState);
  }
});
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const received: unknown[] = [];
const subscription = generateClient().graphql({ query: "subscription S { onX { id } }" }) as unknown as {
  subscribe(observer: { next(value: unknown): void; error(error: unknown): void }): { unsubscribe(): void };
};
subscription.subscribe({ next: (value) => received.push(value), error: () => {} });

await sleep(100);
const a = sockets[0];
if (a === undefined) throw new Error("no socket");
await sleep(15_000 + 6_000); // CONNECTION_INIT_TIMEOUT is 15000 ms, then a retry after a jittered delay
const b = sockets[1];
if (b === undefined) throw new Error("no retry socket");
b.receive({ type: "connection_ack", payload: { connectionTimeoutMs: 8_000 } });
await sleep(50);
const id = b.sent.find((m) => m.type === "start")?.id;
b.receive({ type: "start_ack", id });
await sleep(50);
console.log(`1. socket A after its ack timeout: ${a.closedByClient ? "closed" : "still open"}`);

a.readyState = 3;
a.onclose?.({ code: 1006 }); // socket A closes later, for example when its TCP connection times out
await sleep(50);
b.receive({ type: "data", id, payload: { data: { onX: { id: "1" } } } });
await sleep(50);
const stateAfterClose = states.at(-1);
console.log(`2. state after socket A closed: ${stateAfterClose}; data still arrives on socket B: ${received.length === 1}`);

await sleep(8_000 + 5_000 + 1_000); // socket B is silent for longer than connectionTimeoutMs plus one heartbeat
console.log(`3. silent socket B: ${b.closedByClient ? "closed by the keep-alive check" : "still open"}`);

// The state after a retry is a separate fault (F0218), so this check looks only for the CLOSED record of socket A.
const present = !a.closedByClient || stateAfterClose === "Disconnected" || !b.closedByClient;
console.log(present ? "BUG PRESENT" : "BUG ABSENT");
process.exit(present ? 1 : 0);
