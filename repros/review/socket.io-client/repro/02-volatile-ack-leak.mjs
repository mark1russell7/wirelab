// F0056: the ack handler of a volatile packet that the client discards.
// The socket is not connected, so the transport is not writable, and the client discards each volatile packet.
// The handler of the acknowledgement stays in socket.acks, and emitWithAck() does not settle.
import { io } from "socket.io-client";
import { sleep, versions } from "./lib/server.mjs";

console.log(await versions("socket.io-client"));
const socket = io("http://127.0.0.1:9", { autoConnect: false });

for (let i = 0; i < 3; i++) {
  socket.volatile.emit("hello", () => console.log("the ack callback was called"));
}
console.log(`ack handlers after 3 discarded volatile emits with a callback: ${Object.keys(socket.acks).length}`);

const result = await Promise.race([
  socket.volatile.emitWithAck("hello").then(
    () => "resolved",
    (err) => `rejected (${err.message})`,
  ),
  sleep(2000).then(() => "still pending after 2000 ms"),
]);
console.log(`socket.volatile.emitWithAck("hello"): ${result}`);
console.log(`ack handlers now: ${Object.keys(socket.acks).length}`);

const started = Date.now();
await new Promise((resolve) => {
  socket.volatile.timeout(1000).emit("hello", (err) => {
    console.log(`socket.volatile.timeout(1000).emit(): callback after ${Date.now() - started} ms with "${err?.message}"`);
    resolve();
  });
});

const leaked = Object.keys(socket.acks).length;
console.log(leaked > 0 ? `FAULT: ${leaked} ack handlers stay in socket.acks` : "OK: no ack handler stays");
process.exit(leaked > 0 ? 1 : 0);
