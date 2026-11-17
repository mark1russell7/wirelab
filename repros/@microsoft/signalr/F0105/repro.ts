// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// HubProtocol.md, "Upload streaming": "If the Callee sends a Completion the Caller should stop
// sending StreamItem and Completion messages". HubConnection._launchStreams() subscribes to each
// upload stream and does not dispose the subscription. Thus, after the server completed the
// invocation, the client still sends each StreamItem and the last Completion of the upload stream.
// The same occurs after stream().dispose() (CancelInvocation) of a stream() call with an upload argument.
//
// Public API only: a custom HttpClient answers /negotiate, and an ITransport object records the frames.
import { HttpClient, HttpResponse, HubConnectionBuilder, LogLevel, Subject } from "@microsoft/signalr";
import type { HttpRequest, ITransport } from "@microsoft/signalr";

const RS = "\x1e";

interface Frame {
  readonly type?: number;
  readonly target?: string;
  readonly invocationId?: string;
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
    for (const frame of String(data).split(RS).filter(Boolean)) {
      const msg = JSON.parse(frame) as Frame;
      this.sent.push(msg);
      // The server method completes when it gets the invocation (for example, it rejects the upload).
      if (msg.type === 1 && msg.invocationId !== undefined) {
        const completion = { type: 3, invocationId: msg.invocationId, error: "upload rejected" };
        setTimeout(() => this.onreceive?.(`${JSON.stringify(completion)}${RS}`), 0);
      }
    }
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

const upload = new Subject<number>();
const result = await hub.invoke("Upload", upload).then(
  () => "resolved",
  (e: unknown) => `rejected: ${(e as Error).message}`,
);
const invocation = transport.sent.find((m) => m.type === 1 && m.target === "Upload");
const streamId = invocation?.streamIds?.[0];

// The app goes on with the data of the upload.
for (let i = 0; i < 3; i++) upload.next(i);
upload.complete();
await new Promise((resolve) => setTimeout(resolve, 50));

const afterCompletion = transport.sent.filter((m) => (m.type === 2 || m.type === 3) && m.invocationId === streamId);
await hub.stop();

console.log(`hub.invoke("Upload", subject): ${result} (the server sent Completion)`);
console.log(`messages for upload stream ${streamId} sent after the Completion of the server: ${afterCompletion.length} ${JSON.stringify(afterCompletion)}`);
console.log("expected: 0 (the client stops the upload stream when the invocation completes)");
if (streamId === undefined || afterCompletion.length > 0) {
  console.log("BUG PRESENT: the client still sends the upload stream after the server completed the invocation. Nothing disposes the subscription.");
  process.exit(1);
}
console.log("OK");
process.exit(0);
