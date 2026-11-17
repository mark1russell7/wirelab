// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// A stateful-reconnect attempt fails, and withAutomaticReconnect() starts a new connection that
// does NOT use stateful reconnect. (The new negotiate gives useStatefulReconnect:false, or the
// client goes to SSE or long polling.) HubConnection keeps the old MessageBuffer. That buffer is
// still in the modes "reconnect in progress" and "wait for Sequence". Thus:
//   - _sendWithProtocol() gives each message to the old buffer, which does not send it, so
//     invoke() and send() do not resolve.
//   - _processIncomingData() asks the old buffer, which drops each message until a Sequence message
//     comes. A server with no stateful reconnect does not send a Sequence message.
// onreconnected comes, and the pings still go (they do not go through the buffer), so no timeout occurs.
//
// In process only: a custom HttpClient answers /negotiate, and options.WebSocket is a fake class.
import { HttpClient, HttpResponse, HttpTransportType, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { HttpRequest, IHttpConnectionOptions } from "@microsoft/signalr";

// HttpConnection reads the option WebSocket (the WebSocket class to use), but the public typings do not declare it.
type Options = IHttpConnectionOptions & { readonly WebSocket: unknown };

const RS = "\x1e";
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

interface Frame {
  readonly protocol?: string;
  readonly type?: number;
  readonly invocationId?: string;
}

let negotiateCount = 0;
class FakeHttpClient extends HttpClient {
  override async send(request: HttpRequest): Promise<HttpResponse> {
    if (request.url?.includes("/negotiate") === true) {
      negotiateCount += 1;
      const negotiate = {
        connectionId: `c${negotiateCount}`,
        connectionToken: `tok${negotiateCount}`,
        negotiateVersion: 1,
        useStatefulReconnect: negotiateCount === 1, // The second server does not offer stateful reconnect.
        availableTransports: [{ transport: "WebSockets", transferFormats: ["Text", "Binary"] }],
      };
      return new HttpResponse(200, "OK", JSON.stringify(negotiate));
    }
    return new HttpResponse(404, "Not Found", "");
  }
}

interface CloseInit {
  readonly code: number;
  readonly wasClean: boolean;
  readonly reason: string;
}

const sockets: FakeWebSocket[] = [];
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = 0;
  readonly received: Frame[] = [];
  onopen: ((event: object) => void) | null = null;
  onclose: ((event: CloseInit) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: object) => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    const index = sockets.push(this);
    setTimeout(() => {
      if (index === 2) {
        // The stateful reconnect to the old connection token fails: the server lost the connection.
        this.readyState = 3;
        this.onclose?.({ code: 1006, wasClean: false, reason: "" });
      } else {
        this.readyState = 1;
        this.onopen?.({});
      }
    }, 5);
  }
  send(data: unknown): void {
    for (const frame of String(data).split(RS).filter(Boolean)) {
      const msg = JSON.parse(frame) as Frame;
      this.received.push(msg);
      if (msg.protocol !== undefined) setTimeout(() => this.onmessage?.({ data: `{}${RS}` }), 1);
      if (msg.type === 1 && msg.invocationId !== undefined) {
        const completion = { type: 3, invocationId: msg.invocationId, result: "pong" };
        setTimeout(() => this.onmessage?.({ data: `${JSON.stringify(completion)}${RS}` }), 1);
      }
    }
  }
  close(): void {
    this.readyState = 3;
  }
  drop(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006, wasClean: false, reason: "" });
  }
}

const options: Options = { httpClient: new FakeHttpClient(), WebSocket: FakeWebSocket, transport: HttpTransportType.WebSockets };
const hub = new HubConnectionBuilder()
  .withUrl("http://fake.invalid/hub", options)
  .withStatefulReconnect()
  .withAutomaticReconnect([0])
  .configureLogging(LogLevel.None)
  .build();

const news: unknown[] = [];
hub.on("news", (x: unknown) => news.push(x));
const reconnected = new Promise<void>((resolve) => hub.onreconnected(() => resolve()));

await hub.start();
sockets[0]?.drop();
await reconnected;

const ws3 = sockets[2];
const invokeResult = await Promise.race([
  hub.invoke<string>("Ping").then(
    (r) => `resolved: ${r}`,
    (e: unknown) => `rejected: ${String(e)}`,
  ),
  new Promise<string>((resolve) => setTimeout(() => resolve("still pending after 1000 ms"), 1000)),
]);
ws3?.onmessage?.({ data: `${JSON.stringify({ type: 1, target: "news", arguments: ["hello"] })}${RS}` });
await new Promise((resolve) => setTimeout(resolve, 50));

const invocationsOnNewSocket = ws3?.received.filter((m) => m.type === 1).length ?? 0;
console.log(`negotiates: ${negotiateCount}; sockets: ${sockets.length}; hub.state: ${hub.state}`);
console.log(`hub.invoke("Ping") after onreconnected: ${invokeResult}`);
console.log(`Invocation messages that reached the new socket: ${invocationsOnNewSocket}`);
console.log(`hub.on("news") calls for a message that the server sent on the new socket: ${news.length}`);
console.log("expected: the client sends the invocation and gets its result, and the app gets the message of the server");

await hub.stop().catch(() => {});
if (invocationsOnNewSocket === 0 || news.length === 0) {
  console.log("BUG PRESENT: the old MessageBuffer of the failed connection stops all sends and drops all received messages.");
  process.exit(1);
}
console.log("OK");
process.exit(0);
