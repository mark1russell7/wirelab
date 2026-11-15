// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import WebSocket from "partysocket/ws";

process.on("unhandledRejection", (reason) => {
  console.log("unhandledRejection:", String(reason));
});

let calls = 0;
const ws = new WebSocket(
  () => {
    calls++;
    // for example, reject() in a token fetcher
    return Promise.reject(undefined);
  },
  undefined,
  { minReconnectionDelay: 50, maxReconnectionDelay: 50 },
);
let errors = 0;
ws.addEventListener("error", () => errors++);

setTimeout(() => {
  console.log("provider calls in 500 ms:", calls);
  console.log("error events:", errors);
  console.log("readyState:", ws.readyState);
  ws.close();
}, 500);
