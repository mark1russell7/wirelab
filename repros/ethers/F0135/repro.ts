// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// SocketProvider._processMessage (providers/provider-socket.ts) is async. Since ethers 6.4.0 (issue #4051) it emits
// an "error" event for a JSON message that it does not know. But it calls JSON.parse with no try, and it reads
// result.params.subscription with no check. Thus a frame that is not JSON, or an eth_subscription message with no
// params, rejects the promise of _processMessage. The provider emits no "error" event, and nothing handles the
// rejection. In the default mode of Node.js, an unhandled rejection stops the process.
import { WebSocketProvider } from "ethers";
import type { WebSocketLike } from "ethers";

// This repro records the unhandled rejections, so that the process does not stop.
const unhandled: string[] = [];
process.on("unhandledRejection", (reason) => {
  unhandled.push(reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason));
});

// A socket in memory: the test gives the provider each message.
const socket: WebSocketLike = {
  onopen: null,
  onmessage: null,
  onerror: null,
  readyState: 1,
  send() {},
  close() {},
};
const provider = new WebSocketProvider(socket, 1);
const errors: string[] = [];
provider.on("error", (error: Error & { shortMessage?: string }) => {
  errors.push(error.shortMessage ?? error.message);
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
const frames = [
  JSON.stringify({ jsonrpc: "2.0", note: "a JSON message of unknown form" }),
  "rate limit exceeded",
  JSON.stringify({ jsonrpc: "2.0", method: "eth_subscription" }),
];
let bad = false;
for (const frame of frames) {
  const errorsBefore = errors.length;
  const unhandledBefore = unhandled.length;
  socket.onmessage?.({ data: frame });
  await settle();
  const newErrors = errors.slice(errorsBefore);
  const newUnhandled = unhandled.slice(unhandledBefore);
  console.log(`frame ${JSON.stringify(frame)}: error events ${JSON.stringify(newErrors)}, unhandled rejections ${JSON.stringify(newUnhandled)}`);
  if (newErrors.length === 0 || newUnhandled.length > 0) bad = true;
}
await provider.destroy();

if (bad) {
  console.log("BUG PRESENT: a frame that is not JSON, or an eth_subscription message with no params, gives an unhandled rejection and no error event.");
  process.exit(1);
}
console.log("OK: each malformed frame gives an error event and no unhandled rejection.");
process.exit(0);
