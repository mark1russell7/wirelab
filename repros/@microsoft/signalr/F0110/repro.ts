// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// MessageBuffer._dispose() does not clear the Ack timer of 1 second (_ackTimerHandle), and the timer
// sends through the shared HttpConnection object. The app can stop and start the HubConnection in
// that second (for example to change the user or the token). Then the timer of the OLD buffer sends
// Ack{sequenceId: <count of the old connection>} on the NEW connection.
// HubProtocol.md: the sequenceId of an Ack is the count of the trackable messages that the client
// received on this connection. The new connection received none. A server that trusts this Ack
// removes messages from its resend buffer that the client did not receive.
//
// In process only: a custom HttpClient answers /negotiate, and options.WebSocket is a fake class.
import { HttpClient, HttpResponse, HttpTransportType, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { IHttpConnectionOptions } from "@microsoft/signalr";

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
  readonly sequenceId?: number;
}

let negotiateCount = 0;
class FakeHttpClient extends HttpClient {
  override async send(): Promise<HttpResponse> {
    negotiateCount += 1;
    const negotiate = {
      connectionId: `c${negotiateCount}`,
      connectionToken: `tok${negotiateCount}`,
      negotiateVersion: 1,
      useStatefulReconnect: true,
      availableTransports: [{ transport: "WebSockets", transferFormats: ["Text", "Binary"] }],
    };
    return new HttpResponse(200, "OK", JSON.stringify(negotiate));
  }
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
  onclose: ((event: object) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: object) => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    sockets.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.({});
    }, 1);
  }
  send(data: unknown): void {
    for (const frame of String(data).split(RS).filter(Boolean)) {
      const msg = JSON.parse(frame) as Frame;
      this.received.push(msg);
      if (msg.protocol !== undefined) setTimeout(() => this.onmessage?.({ data: `{}${RS}` }), 1);
    }
  }
  close(): void {
    this.readyState = 3;
  }
}

const options: Options = { httpClient: new FakeHttpClient(), WebSocket: FakeWebSocket, transport: HttpTransportType.WebSockets };
const hub = new HubConnectionBuilder()
  .withUrl("http://fake.invalid/hub", options)
  .withStatefulReconnect()
  .configureLogging(LogLevel.None)
  .build();
hub.on("msg", () => {});

await hub.start();
for (let i = 1; i <= 3; i++) sockets[0]?.onmessage?.({ data: `${JSON.stringify({ type: 1, target: "msg", arguments: [i] })}${RS}` });
// The app stops and starts again at once, well in the Ack delay of 1 second.
await hub.stop();
await hub.start();
await new Promise((resolve) => setTimeout(resolve, 1300));
const acksOnNew = (sockets[1]?.received ?? []).filter((m) => m.type === 8).map((m) => m.sequenceId ?? 0);
await hub.stop();

console.log("old connection: 3 trackable messages received; new connection: 0 trackable messages received");
console.log(`Ack messages sent on the NEW connection: ${JSON.stringify(acksOnNew)}`);
console.log("expected: no Ack with a sequenceId above 0 on the new connection");
if (acksOnNew.some((id) => id > 0)) {
  console.log("BUG PRESENT: the Ack timer of the disposed MessageBuffer sent the sequence id of the old connection on the new connection.");
  process.exit(1);
}
console.log("OK");
process.exit(0);
