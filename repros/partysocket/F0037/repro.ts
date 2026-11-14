// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// This loads partysocket/ws as a browser bundle does: process.versions.node is hidden while the module is
// imported, so partysocket uses cloneEventBrowser().
const versions = Object.getOwnPropertyDescriptor(process, "versions")!;
Object.defineProperty(process, "versions", { ...versions, value: { ...process.versions, node: undefined } });
const { default: WebSocket } = await import("partysocket/ws");
Object.defineProperty(process, "versions", versions);

// A WebSocket that stays in CONNECTING (a server that does not answer).
class PendingWebSocket extends EventTarget {
  readyState = 0;
  send() {}
  close() {
    this.readyState = 3;
  }
}
const show = (v: unknown) =>
  typeof v === "string" || typeof v === "number" ? JSON.stringify(v) : Object.prototype.toString.call(v);

// 1) close(4000, "bye")
const ws = new WebSocket("ws://example.test/", undefined, { WebSocket: PendingWebSocket });
await new Promise((resolve) => setTimeout(resolve, 20));
ws.onclose = (e) => console.log("onclose:        code", show(e.code), "reason", show(e.reason));
ws.addEventListener("close", (e) => console.log("close listener: code", show(e.code), "reason", show(e.reason)));
ws.close(4000, "bye");

// 2) a connection timeout
const timeout = new WebSocket("ws://example.test/", undefined, {
  WebSocket: PendingWebSocket,
  connectionTimeout: 50,
  maxRetries: 0,
});
timeout.onerror = (e) => console.log("onerror:        message", show(e.message), "error", show(e.error));
timeout.addEventListener("error", (e) => console.log("error listener: message", show(e.message), "error", show(e.error)));

// The file is a module, so top-level await works.
export {};
