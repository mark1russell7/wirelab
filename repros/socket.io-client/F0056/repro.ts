// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import { io } from "socket.io-client";

// The socket is not connected (autoConnect: false), so the client discards each volatile packet.
const socket = io("http://127.0.0.1:9", { autoConnect: false });
const ackHandlers = () => Object.keys(Reflect.get(socket, "acks")).length; // the field acks is private

for (let i = 0; i < 3; i++) {
  socket.volatile.emit("hello", () => console.log("ack callback called"));
}
console.log(`ack handlers after 3 discarded volatile emits with a callback: ${ackHandlers()}`);

const result = await Promise.race([
  socket.volatile.emitWithAck("hello").then(
    () => "resolved",
    (err: Error) => `rejected (${err.message})`,
  ),
  new Promise((resolve) => setTimeout(resolve, 2000, "still pending after 2000 ms")),
]);
console.log(`socket.volatile.emitWithAck("hello"): ${result}`);

const started = Date.now();
socket.volatile.timeout(1000).emit("hello", (err: Error) => {
  console.log(`socket.volatile.timeout(1000).emit(): callback after ${Date.now() - started} ms, error "${err?.message}"`);
  console.log(`ack handlers at the end: ${ackHandlers()}`);
  process.exit(0);
});
