// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import { createElement } from "react";
import type PartySocket from "partysocket";
import usePartySocket from "partysocket/react";
import type { ReactTestRenderer } from "react-test-renderer";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
// This hides the deprecation notice of react-test-renderer.
const consoleError = console.error;
console.error = (...args: unknown[]) =>
  String(args[0]).includes("react-test-renderer is deprecated") ? undefined : consoleError(...args);
const { default: TestRenderer, act } = await import("react-test-renderer");

// This WebSocket records the URL of each connection, and opens at once.
const urls: string[] = [];
class FakeWebSocket extends EventTarget {
  readyState = 0;
  constructor(url: string) {
    super();
    urls.push(url);
    setTimeout(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    }, 0);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
}

let socket: PartySocket | undefined;
function Room({ room, enabled }: { room: string; enabled: boolean }) {
  socket = usePartySocket({
    host: "example.com",
    room,
    enabled,
    id: "client-1",
    WebSocket: FakeWebSocket,
  });
  return null;
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const render = (props: { room: string; enabled: boolean }) => createElement(Room, props);

let renderer: ReactTestRenderer | undefined;
await act(async () => {
  renderer = TestRenderer.create(render({ room: "a", enabled: false }));
});
await act(async () => renderer?.update(render({ room: "a", enabled: true })));
await act(() => sleep(50));
await act(async () => renderer?.update(render({ room: "b", enabled: true })));
await act(() => sleep(50));

console.log("props: room b");
console.log("socket.room:", socket?.room);
console.log("connections:", JSON.stringify(urls, null, 2));
await act(async () => renderer?.unmount());
