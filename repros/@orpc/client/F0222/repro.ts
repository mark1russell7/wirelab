// Repro: @orpc/client 1.16.5, ClientRetryPlugin waits the whole retry delay
// after the signal of the call aborts. The call rejects only when the delay
// ends. RetryAfterPlugin of the same package stops its delay at the abort.
//
// A stub fetch fails the first request. The retry delay is 3000 ms. The
// caller aborts 100 ms after the call starts.
import type { ClientRetryPluginContext } from "@orpc/client/plugins";
import type { Client } from "@orpc/client";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { ClientRetryPlugin } from "@orpc/client/plugins";

const RETRY_DELAY_MS = 3000;
const ABORT_AFTER_MS = 100;
let requests = 0;

const link = new RPCLink<ClientRetryPluginContext>({
  url: "http://orpc.invalid/rpc",
  fetch: async () => {
    requests++;
    throw new TypeError("fetch failed");
  },
  plugins: [new ClientRetryPlugin({ default: { retry: 1, retryDelay: RETRY_DELAY_MS } })],
});
const client = createORPCClient<{ ping: Client<ClientRetryPluginContext, string, string, Error> }>(link);

const controller = new AbortController();
const start = performance.now();
setTimeout(() => controller.abort(new Error("aborted by the caller")), ABORT_AFTER_MS);

let outcome: string;
try {
  await client.ping("x", { signal: controller.signal });
  outcome = "resolved";
} catch (error) {
  outcome = `rejected: ${(error as Error).message}`;
}
const elapsed = Math.round(performance.now() - start);

console.log(`retry delay ${RETRY_DELAY_MS} ms, abort at ${ABORT_AFTER_MS} ms`);
console.log(`the call ${outcome} after ${elapsed} ms, with ${requests} request(s)`);
console.log(elapsed >= RETRY_DELAY_MS ? "BUG PRESENT" : "BUG ABSENT");
