// @trpc/client 11.31.2, wsLink. When a subscription yields an event without an id (not wrapped in tracked()), the
// client sets the lastEventId of the subscription to undefined. After a reconnect, the client subscribes again with
// no lastEventId, so the server cannot resume after the last tracked event: the events in between are lost, or the
// stream starts again. httpSubscriptionLink and the SSE server keep the last tracked id in this case (trpc #7691).
// Control: without the event that has no id, the second subscribe gets lastEventId "1".
import { initTRPC, tracked } from "@trpc/server";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { createTRPCClient, createWSClient, wsLink } from "@trpc/client";
import { WebSocket, WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";

const t = initTRPC.create();
const inputs: (string | undefined)[] = [];
const router = t.router({
  events: t.procedure
    .input((value: unknown) => value as { lastEventId?: string } | undefined)
    .subscription(async function* ({ input, signal }) {
      inputs.push(input?.lastEventId);
      if (input?.lastEventId === undefined) {
        yield tracked("1", "tracked event 1");
        yield "event without an id";
      }
      await new Promise((resolve) => signal?.addEventListener("abort", resolve));
    }),
});
const wss = new WebSocketServer({ port: 0 });
const handler = applyWSSHandler({ wss, router });
const { port } = wss.address() as AddressInfo;
const wsClient = createWSClient({
  url: `ws://localhost:${port}`,
  WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
  retryDelayMs: () => 50,
});
const client = createTRPCClient<typeof router>({ links: [wsLink({ client: wsClient })] });
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const received: unknown[] = [];
const subscription = client.events.subscribe(undefined, { onData: (data) => received.push(data) });
await sleep(300);
console.log(`events before the reconnect: ${JSON.stringify(received)}`);
handler.broadcastReconnectNotification(); // the server asks the client to reconnect, as at a deploy
await sleep(500);

console.log(`subscribes on the server: ${inputs.length}`);
console.log(`lastEventId of the second subscribe: ${JSON.stringify(inputs[1])} (expected "1")`);
const present = inputs.length >= 2 && inputs[1] !== "1";
console.log(present ? "BUG PRESENT" : inputs.length < 2 ? "NO SECOND SUBSCRIBE" : "BUG ABSENT");
subscription.unsubscribe();
void wsClient.close();
wss.close();
process.exit(present ? 1 : 0);
