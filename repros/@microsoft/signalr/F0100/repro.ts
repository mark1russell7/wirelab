// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// HubConnection.send(), invoke() and stream() with two stream arguments next to each other.
// _replaceStreamingParams() removes args[i] with splice() in a forward loop and then goes to i + 1.
// Thus it does not examine the argument after a removed stream. The client sends the second stream
// as a plain JSON argument, with no stream id.
//
// Public API only: a custom HttpClient answers /negotiate, and an ITransport object records the
// frames that the client sends. No network.
import { HttpClient, HttpResponse, HubConnectionBuilder, LogLevel, Subject } from "@microsoft/signalr";
import type { HttpRequest, ITransport } from "@microsoft/signalr";

const RS = "\x1e";

interface Frame {
  readonly type?: number;
  readonly target?: string;
  readonly arguments?: unknown[];
  readonly streamIds?: string[];
}

class FakeHttpClient extends HttpClient {
  override async send(request: HttpRequest): Promise<HttpResponse> {
    if (request.url?.includes("/negotiate") === true) {
      const negotiate = { connectionId: "c1", connectionToken: "t1", negotiateVersion: 1, availableTransports: [] };
      return new HttpResponse(200, "OK", JSON.stringify(negotiate));
    }
    return new HttpResponse(200, "OK", "");
  }
}

class FakeTransport implements ITransport {
  onreceive: ((data: string | ArrayBuffer) => void) | null = null;
  onclose: ((error?: Error) => void) | null = null;
  readonly sent: Frame[] = [];
  private handshakeDone = false;
  async connect(): Promise<void> {}
  async send(data: unknown): Promise<void> {
    for (const frame of String(data).split(RS).filter(Boolean)) this.sent.push(JSON.parse(frame) as Frame);
    if (!this.handshakeDone) {
      this.handshakeDone = true;
      setTimeout(() => this.onreceive?.(`{}${RS}`), 0);
    }
  }
  async stop(): Promise<void> {
    this.onclose?.();
  }
}

const transport = new FakeTransport();
const hub = new HubConnectionBuilder()
  .withUrl("http://fake.invalid/hub", { httpClient: new FakeHttpClient(), transport })
  .configureLogging(LogLevel.None)
  .build();

await hub.start();
await hub.send("UploadTwo", new Subject<number>(), new Subject<number>());
const invocation = transport.sent.find((m) => m.type === 1 && m.target === "UploadTwo");
await hub.stop();

console.log(`sent invocation: ${JSON.stringify(invocation)}`);
const argsCount = invocation?.arguments?.length ?? -1;
const streamIdCount = invocation?.streamIds?.length ?? 0;
console.log(`expected: arguments=[] and 2 streamIds; saw: ${argsCount} argument(s) and ${streamIdCount} streamId(s)`);
if (argsCount !== 0 || streamIdCount !== 2) {
  console.log("BUG PRESENT: the client sent the second adjacent stream argument as a plain argument, with no stream id.");
  process.exit(1);
}
console.log("OK: both streams got stream ids.");
process.exit(0);
