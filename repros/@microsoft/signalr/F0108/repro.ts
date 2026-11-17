// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// Two public promises reject with a plain string, not an Error:
//   a) WebSocketTransport.send(): Promise.reject("WebSocket is not in the OPEN state").
//      hub.send() and invoke() get it while the socket is CLOSING (the close handshake is in
//      progress, onclose has not come yet, and HttpConnection is still Connected).
//   b) TransportSendQueue._sendLoop(): this._transportResult.reject("Connection stopped.").
//      The hub.send() calls in the queue behind a send in progress get it when the connection stops.
// A caller that reads error.message or error.name gets undefined, instanceof Error gives false,
// and there is no stack.
//
// In process only: options.WebSocket is a fake class (a), an ITransport object (b), and a custom
// HttpClient answers /negotiate.
import { HttpClient, HttpResponse, HttpTransportType, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { IHttpConnectionOptions, ITransport } from "@microsoft/signalr";

// HttpConnection reads the option WebSocket (the WebSocket class to use), but the public typings do not declare it.
type Options = IHttpConnectionOptions & { readonly WebSocket: unknown };

const RS = "\x1e";
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

const describeReason = (reason: unknown): string =>
  `${typeof reason} ${reason instanceof Error ? "(Error)" : "(not an Error)"}: ${JSON.stringify(reason instanceof Error ? reason.message : reason)}`;

// a) A WebSocket in the state CLOSING.
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static last: FakeWebSocket | undefined;
  readyState = 0;
  onopen: ((event: object) => void) | null = null;
  onclose: ((event: object) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: object) => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.last = this;
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.({});
    }, 1);
  }
  send(data: unknown): void {
    if (String(data).includes('"protocol"')) setTimeout(() => this.onmessage?.({ data: `{}${RS}` }), 1);
  }
  close(): void {
    this.readyState = 3;
  }
}
const options: Options = { skipNegotiation: true, transport: HttpTransportType.WebSockets, WebSocket: FakeWebSocket };
const hubA = new HubConnectionBuilder()
  .withUrl("http://fake.invalid/hub", options)
  .configureLogging(LogLevel.None)
  .build();
await hubA.start();
if (FakeWebSocket.last !== undefined) FakeWebSocket.last.readyState = FakeWebSocket.CLOSING; // The server started the close handshake.
let reasonA: unknown;
await hubA.send("Hello").catch((e: unknown) => {
  reasonA = e;
});
await hubA.stop();
console.log(`a) hub.send() while the WebSocket is CLOSING rejected with ${describeReason(reasonA)}`);

// b) Sends in the queue behind a send in progress when the connection stops.
class FakeHttpClient extends HttpClient {
  override async send(): Promise<HttpResponse> {
    const negotiate = { connectionId: "c1", connectionToken: "t1", negotiateVersion: 1, availableTransports: [] };
    return new HttpResponse(200, "OK", JSON.stringify(negotiate));
  }
}
class SlowTransport implements ITransport {
  onreceive: ((data: string | ArrayBuffer) => void) | null = null;
  onclose: ((error?: Error) => void) | null = null;
  release: (() => void) | null = null;
  private handshakeDone = false;
  async connect(): Promise<void> {}
  send(data: unknown): Promise<void> {
    if (!this.handshakeDone) {
      this.handshakeDone = true;
      setTimeout(() => this.onreceive?.(`{}${RS}`), 0);
      return Promise.resolve();
    }
    // A slow write to the network.
    if (String(data).includes('"First"')) {
      return new Promise<void>((resolve) => {
        this.release = resolve;
      });
    }
    return Promise.resolve();
  }
  async stop(): Promise<void> {
    this.onclose?.();
  }
}
const slow = new SlowTransport();
const hubB = new HubConnectionBuilder()
  .withUrl("http://fake.invalid/hub", { httpClient: new FakeHttpClient(), transport: slow })
  .configureLogging(LogLevel.None)
  .build();
await hubB.start();
hubB.send("First").catch(() => {});
await new Promise((resolve) => setTimeout(resolve, 10));
let reasonB: unknown;
const second = hubB.send("Second").catch((e: unknown) => {
  reasonB = e;
});
await hubB.stop();
slow.release?.();
await second;
console.log(`b) hub.send() in the queue when the connection stopped rejected with ${describeReason(reasonB)}`);
console.log("expected: both reject with an Error object");

const bad = [reasonA, reasonB].filter((r) => !(r instanceof Error));
if (bad.length > 0) {
  console.log(`BUG PRESENT: ${bad.length} rejection(s) are plain strings, not Error objects.`);
  process.exit(1);
}
console.log("OK");
process.exit(0);
