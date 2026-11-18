// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// SocketProvider._register (providers/provider-socket.ts) puts each subscriber in the private map #subs when the
// node answers eth_subscribe. SocketSubscriber.stop sends eth_unsubscribe, but no code removes the subscriber from
// #subs. Thus each on() and off() of a socket event, or each once(), keeps one subscriber for the life of the
// provider. This repro makes 50 subscribers with on() and off(), and then counts the subscribers that garbage
// collection cannot free.
import v8 from "node:v8";
import vm from "node:vm";
import { WebSocketProvider } from "ethers";
import type { Subscriber, Subscription, WebSocketLike } from "ethers";

v8.setFlagsFromString("--expose-gc");
const gc = vm.runInNewContext("gc") as () => void;

// A node in memory: it answers each request on the next turn of the event loop.
let nextFilterId = 1;
const socket: WebSocketLike = {
  onopen: null,
  onmessage: null,
  onerror: null,
  readyState: 1,
  send(text: string) {
    const request = JSON.parse(text) as { id: number; method: string };
    const results: Record<string, unknown> = {
      eth_chainId: "0x1",
      eth_blockNumber: "0x10",
      eth_subscribe: undefined,
      eth_unsubscribe: true,
    };
    const result = request.method === "eth_subscribe" ? `0x${(nextFilterId++).toString(16)}` : (results[request.method] ?? null);
    setTimeout(() => socket.onmessage?.({ data: JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) }), 0);
  },
  close() {},
};

// Each subscriber that the provider makes goes into a WeakRef, which does not keep it alive.
const made: WeakRef<Subscriber>[] = [];
class WatchedProvider extends WebSocketProvider {
  override _getSubscriber(sub: Subscription): Subscriber {
    const subscriber = super._getSubscriber(sub);
    made.push(new WeakRef(subscriber));
    return subscriber;
  }
}

const provider = new WatchedProvider(socket, 1);
await socket.onopen?.();
const turn = () => new Promise((resolve) => setTimeout(resolve, 5));
for (let i = 0; i < 50; i++) {
  const listener = () => {};
  await provider.on("block", listener);
  await turn();
  await provider.off("block", listener);
  await turn();
}

// A control object with no references, to show that garbage collection runs.
const control = new WeakRef({ data: new Array(1000).fill(0) });
for (let i = 0; i < 5; i++) {
  gc();
  await turn();
}
const alive = made.filter((ref) => ref.deref() !== undefined).length;
console.log(`subscribers made: ${made.length}, eth_subscribe calls: ${nextFilterId - 1}`);
console.log(`listeners left: ${await provider.listenerCount("block")}, control object freed: ${control.deref() === undefined}`);
console.log(`subscribers still alive after off() and garbage collection: ${alive}`);
await provider.destroy();

if (control.deref() !== undefined) {
  console.log("NO RESULT: garbage collection did not free the control object.");
  process.exit(2);
}
if (alive > 1) {
  console.log("BUG PRESENT: after off(), the SocketProvider keeps each subscriber, so a cycle of on() and off() grows the memory of the provider.");
  process.exit(1);
}
console.log("OK: the provider frees each subscriber after off().");
process.exit(0);
