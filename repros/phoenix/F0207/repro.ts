// phoenix 1.8.17 (JavaScript client). The Socket constructor uses the `encode` and `decode` options only when the
// transport is not LongPoll: a socket made with `transport: LongPoll` always uses the default JSON serializer. But
// when a WebSocket socket falls back to LongPoll (option `longPollFallbackMs`), replaceTransport changes only the
// transport, so the socket keeps the custom `encode` and `decode` over LongPoll. On the server, each transport has its
// own serializer, so the two LongPoll paths can disagree with the same server.
// The repro needs no server: LongPoll opens at once and records what it sends, and the WebSocket fails to connect.
import { LongPoll, Socket } from "phoenix";

const sent: unknown[] = [];
const lp = LongPoll.prototype as unknown as Record<string, unknown>;
lp.poll = function (this: { readyState: number; onopen: (e: object) => void }) {
  if (this.readyState === 0) {
    this.readyState = 1;
    this.onopen({});
  }
};
lp.send = (body: unknown) => sent.push(body);

class FailingWebSocket {
  readyState = 0;
  onerror?: (e: unknown) => void;
  onclose?: (e: { code: number }) => void;
  constructor() {
    setTimeout(() => {
      this.readyState = 3;
      this.onerror?.("refused");
      this.onclose?.({ code: 1006 });
    }, 5);
  }
  close() {
    this.readyState = 3;
  }
  send() {
    throw new Error("not open");
  }
}

let customEncodes = 0;
const encode = (msg: { join_ref?: string; ref?: string; topic: string; event: string; payload: object }, callback: (encoded: string) => void) => {
  customEncodes += 1;
  return callback(JSON.stringify([msg.join_ref, msg.ref, msg.topic, msg.event, msg.payload]));
};
const decode = (raw: string, callback: (decoded: object) => void) => {
  const [join_ref, ref, topic, event, payload] = JSON.parse(raw);
  return callback({ join_ref, ref, topic, event, payload });
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(label: string, opts: object): Promise<number> {
  customEncodes = 0;
  sent.length = 0;
  const socket = new Socket("ws://127.0.0.1:1/socket", { encode, decode, ...opts } as never);
  socket.connect();
  await wait(200);
  socket.channel("room:lobby").join();
  await wait(50);
  const name = (socket as unknown as { transport: unknown }).transport === LongPoll ? "LongPoll" : "other";
  console.log(`${label}: transport ${name}, messages sent ${sent.length}, of them with the custom encode ${customEncodes}`);
  socket.disconnect();
  return customEncodes;
}

const direct = await run("transport: LongPoll", { transport: LongPoll });
const fallback = await run("WebSocket that fails, longPollFallbackMs: 50", { transport: FailingWebSocket, longPollFallbackMs: 50 });
const bug = direct !== fallback;
console.log("expected: the two LongPoll sockets use the same encoder");
console.log(bug ? "BUG PRESENT" : "BUG ABSENT");
process.exit(bug ? 1 : 0);
