// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { Manager } from "socket.io-client";

const options = { reconnectionAttempts: 0, reconnectionDelay: 0, reconnectionDelayMax: 0 };
const manager = new Manager("http://127.0.0.1:9", { autoConnect: false, ...options });
console.log(`options: ${JSON.stringify(options)}`);
console.log(`reconnectionAttempts(): ${manager.reconnectionAttempts()}`);
console.log(`reconnectionDelay(): ${manager.reconnectionDelay()}`);
console.log(`reconnectionDelayMax(): ${manager.reconnectionDelayMax()}`);
const setter = new Manager("http://127.0.0.1:9", { autoConnect: false }).reconnectionAttempts(0);
console.log(`with the setter, reconnectionAttempts(0) then reconnectionAttempts(): ${setter.reconnectionAttempts()}`);

// A port with no server: the first connection fails, then the Manager reconnects or gives up.
const port = await new Promise<number>((resolve) => {
  const s = createServer().listen(0, "127.0.0.1", () => {
    const { port } = s.address() as AddressInfo;
    s.close(() => resolve(port));
  });
});
const live = new Manager(`http://127.0.0.1:${port}`, {
  reconnectionAttempts: 0,
  reconnectionDelay: 50,
  reconnectionDelayMax: 50,
});
let attempts = 0;
let failed = false;
live.on("reconnect_attempt", () => attempts++);
live.on("reconnect_failed", () => (failed = true));
live.socket("/");

await new Promise((resolve) => setTimeout(resolve, 1500));
console.log(`reconnectionAttempts: 0, no server, after 1500 ms: ${attempts} reconnect_attempt events, reconnect_failed: ${failed}`);
process.exit(0);
