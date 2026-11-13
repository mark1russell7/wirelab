// F0059: the value 0 of reconnectionAttempts, reconnectionDelay and reconnectionDelayMax in the options of the Manager.
// The setters accept 0, but the constructor uses "||", so 0 becomes the default value.
import { createServer } from "node:net";
import { Manager } from "socket.io-client";
import { sleep, versions } from "./lib/server.mjs";

console.log(await versions("socket.io-client"));
const options = { reconnectionAttempts: 0, reconnectionDelay: 0, reconnectionDelayMax: 0 };
const m = new Manager("http://127.0.0.1:9", { autoConnect: false, ...options });
console.log(`options: ${JSON.stringify(options)}`);
console.log(`reconnectionAttempts(): ${m.reconnectionAttempts()}`);
console.log(`reconnectionDelay(): ${m.reconnectionDelay()}`);
console.log(`reconnectionDelayMax(): ${m.reconnectionDelayMax()}`);
const setter = new Manager("http://127.0.0.1:9", { autoConnect: false }).reconnectionAttempts(0);
console.log(`with the setter: reconnectionAttempts(0) then reconnectionAttempts(): ${setter.reconnectionAttempts()}`);

// A port with no server: the first connection fails, then the Manager reconnects or gives up.
const port = await new Promise((resolve) => {
  const s = createServer().listen(0, "127.0.0.1", () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});
const live = new Manager(`http://127.0.0.1:${port}`, { reconnectionAttempts: 0, reconnectionDelay: 50, reconnectionDelayMax: 50 });
let attempts = 0;
let failed = false;
live.on("reconnect_attempt", () => attempts++);
live.on("reconnect_failed", () => (failed = true));
live.socket("/");
await sleep(1500);
console.log(`reconnectionAttempts: 0, a port with no server, after 1500 ms: ${attempts} reconnect_attempt events, reconnect_failed ${failed}`);
if (typeof live._close === "function") live._close();
const fault = m.reconnectionAttempts() !== 0 || attempts > 0;
console.log(fault ? "FAULT: the Manager does not use the value 0 of the options" : "OK: the Manager uses the value 0");
process.exit(fault ? 1 : 0);
