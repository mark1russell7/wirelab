// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// With withStatefulReconnect(), HubConnection makes its MessageBuffer only after the handshake
// promise resolves (HubConnection._startInternal). The client handles the messages that come in the
// same frame as the handshake response (or in the same tick) before that:
//   A) First start: there is no buffer yet, so the app gets these messages, but the client does NOT
//      count them. Thus the sequence numbers of the client are one less than those of the server.
//      After a stateful reconnect, the app gets the resend of the server a second time.
//   B) Start after withAutomaticReconnect(): the OLD buffer is still there and waits for a Sequence
//      message, so the client drops these messages and gives no error.
//
// In process only: a custom HttpClient answers /negotiate, options.WebSocket is a fake class, and
// the fake server obeys the Ack and Sequence rules of HubProtocol.md.
import { HttpClient, HttpResponse, HttpTransportType, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { HttpRequest, IHttpConnectionOptions } from "@microsoft/signalr";

// HttpConnection reads the option WebSocket (the WebSocket class to use), but the public typings do not declare it.
type Options = IHttpConnectionOptions & { readonly WebSocket: unknown };

const RS = "\x1e";
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

const inv = (target: string, arg: string): string => `${JSON.stringify({ type: 1, target, arguments: [arg] })}${RS}`;

interface Plan {
  readonly failSocket?: number;
  readonly waitReconnected?: boolean;
  readonly firstMessage: (index: number) => string;
  readonly expected: readonly string[];
}

interface Frame {
  readonly protocol?: string;
  readonly type?: number;
  readonly sequenceId?: number;
}

interface ServerConnection {
  readonly sent: Array<{ readonly seq: number; readonly frame: string }>;
  acked: number;
}

async function scenario(name: string, plan: Plan): Promise<boolean> {
  let negotiateCount = 0;
  class FakeHttpClient extends HttpClient {
    override async send(request: HttpRequest): Promise<HttpResponse> {
      if (request.url?.includes("/negotiate") === true) {
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
      return new HttpResponse(404, "Not Found", "");
    }
  }
  // The state of the server for each logical connection (by token): the messages that it sent, with their sequence ids.
  const serverConn = new Map<string, ServerConnection>();
  const sockets: FakeWebSocket[] = [];
  class FakeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readyState = 0;
    readonly token: string;
    readonly index: number;
    onopen: ((event: object) => void) | null = null;
    onclose: ((event: object) => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((event: object) => void) | null = null;
    readonly url: string;
    constructor(url: string) {
      this.url = url;
      this.token = new URL(url.replace(/^ws/, "http")).searchParams.get("id") ?? "";
      this.index = sockets.push(this);
      setTimeout(() => {
        if (plan.failSocket === this.index) {
          this.readyState = 3;
          this.onclose?.({ code: 1006, wasClean: false, reason: "" });
          return;
        }
        this.readyState = 1;
        this.onopen?.({});
      }, 5);
    }
    state(): ServerConnection {
      let s = serverConn.get(this.token);
      if (s === undefined) {
        s = { sent: [], acked: 0 };
        serverConn.set(this.token, s);
      }
      return s;
    }
    // The server sends a trackable message. It gets the next sequence id of this logical connection.
    push(target: string, arg: string): string {
      const s = this.state();
      s.sent.push({ seq: s.sent.length + 1, frame: inv(target, arg) });
      return inv(target, arg);
    }
    send(data: unknown): void {
      for (const frame of String(data).split(RS).filter(Boolean)) {
        const msg = JSON.parse(frame) as Frame;
        if (msg.protocol !== undefined) {
          // The handshake response and one app message in the SAME frame.
          const first = this.push("msg", plan.firstMessage(this.index));
          setTimeout(() => this.onmessage?.({ data: `{}${RS}${first}` }), 1);
        } else if (msg.type === 8) {
          this.state().acked = Math.max(this.state().acked, msg.sequenceId ?? 0);
        } else if (msg.type === 9) {
          // The client resumed this logical connection: a Sequence message, and the resend of each message with no Ack.
          const s = this.state();
          const resend = s.sent.filter((m) => m.seq > s.acked);
          const out = `${JSON.stringify({ type: 9, sequenceId: s.acked + 1 })}${RS}${resend.map((m) => m.frame).join("")}`;
          setTimeout(() => this.onmessage?.({ data: out }), 1);
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
  const delivered: string[] = [];
  hub.on("msg", (x: string) => delivered.push(x));
  const reconnected = new Promise<void>((resolve) => hub.onreconnected(() => resolve()));

  await hub.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  // A second app message in its own frame.
  const s0 = sockets[0];
  s0?.onmessage?.({ data: s0.push("msg", "second") });
  await new Promise((resolve) => setTimeout(resolve, 20));
  s0?.drop();
  if (plan.waitReconnected === true) await reconnected;
  await new Promise((resolve) => setTimeout(resolve, 100));
  await hub.stop().catch(() => {});
  console.log(`[${name}] app saw: ${JSON.stringify(delivered)}; expected: ${JSON.stringify(plan.expected)}`);
  return JSON.stringify(delivered) === JSON.stringify(plan.expected);
}

const okA = await scenario("A first start, then stateful reconnect", {
  firstMessage: () => "first",
  expected: ["first", "second"],
});
const okB = await scenario("B automatic reconnect after a failed stateful reconnect", {
  failSocket: 2,
  waitReconnected: true,
  firstMessage: (i) => (i === 1 ? "first" : "welcome"),
  expected: ["first", "second", "welcome"],
});

if (!okA || !okB) {
  const a = okA ? "" : "A: the app got a message two times after a stateful reconnect. ";
  const b = okB ? "" : "B: the client dropped a message of the handshake frame.";
  console.log(`BUG PRESENT: ${a}${b}`);
  process.exit(1);
}
console.log("OK");
process.exit(0);
