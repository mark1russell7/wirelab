// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import WebSocket from "partysocket/ws";

const ws = new WebSocket("ws://127.0.0.1:9/");
let closeEvents = 0;
ws.addEventListener("close", () => closeEvents++);
console.log("readyState before close():", ws.readyState);
ws.close();
console.log("readyState after close():", ws.readyState);
console.log("close events:", closeEvents);
setTimeout(() => {
  console.log("close events 100 ms later:", closeEvents);
}, 100);
