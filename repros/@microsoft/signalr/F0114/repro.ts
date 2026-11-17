// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// The published typings document IStreamSubscriber.closed as "A boolean that will be set by the
// IStreamResult when the stream is closed." (Stream.ts and dist/esm/Stream.d.ts). No code sets it.
// After the server completes or fails the stream, or after subscription.dispose(),
// subscriber.closed stays undefined.
//
// Public API only: an ITransport object and a custom HttpClient.
import fs from "node:fs";
import { createRequire } from "node:module";
import { HttpClient, HttpResponse, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { IStreamSubscriber, ITransport } from "@microsoft/signalr";

const RS = "\x1e";
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

const require = createRequire(import.meta.url);
const dts = fs.readFileSync(require.resolve("@microsoft/signalr/dist/esm/Stream.d.ts"), "utf8");
const doc = (/\/\*\*([^*]|\*(?!\/))*\*\/\s*closed\?: boolean;/.exec(dts)?.[0] ?? "(not found)").replace(/\s+/g, " ");
console.log(`Stream.d.ts: ${doc}`);

interface Frame {
  readonly type?: number;
  readonly target?: string;
  readonly invocationId?: string;
}

class FakeHttpClient extends HttpClient {
  override async send(): Promise<HttpResponse> {
    const negotiate = { connectionId: "c1", connectionToken: "t1", negotiateVersion: 1, availableTransports: [] };
    return new HttpResponse(200, "OK", JSON.stringify(negotiate));
  }
}
class FakeTransport implements ITransport {
  onreceive: ((data: string | ArrayBuffer) => void) | null = null;
  onclose: ((error?: Error) => void) | null = null;
  private handshakeDone = false;
  async connect(): Promise<void> {}
  async send(data: unknown): Promise<void> {
    if (!this.handshakeDone) {
      this.handshakeDone = true;
      setTimeout(() => this.onreceive?.(`{}${RS}`), 0);
      return;
    }
    for (const frame of String(data).split(RS).filter(Boolean)) {
      const msg = JSON.parse(frame) as Frame;
      // A StreamInvocation gets one item, then a Completion (or an error).
      if (msg.type === 4) {
        const done = msg.target === "Fails" ? { type: 3, invocationId: msg.invocationId, error: "boom" } : { type: 3, invocationId: msg.invocationId };
        const item = { type: 2, invocationId: msg.invocationId, item: 1 };
        setTimeout(() => this.onreceive?.(`${JSON.stringify(item)}${RS}${JSON.stringify(done)}${RS}`), 0);
      }
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

const subscriber = (onDone: () => void): IStreamSubscriber<unknown> => ({
  next: () => {},
  error: () => onDone(),
  complete: () => onDone(),
});
const streamUntilDone = (method: string): Promise<IStreamSubscriber<unknown>> =>
  new Promise((resolve) => {
    const s = subscriber(() => resolve(s));
    hub.stream(method).subscribe(s);
  });
const completed = await streamUntilDone("Counter");
const errored = await streamUntilDone("Fails");
const disposedSub: IStreamSubscriber<unknown> = { next: () => {}, error: () => {}, complete: () => {} };
hub.stream("Never").subscribe(disposedSub).dispose();
await hub.stop();

console.log(`after the server completed the stream: subscriber.closed = ${completed.closed}`);
console.log(`after the server failed the stream:    subscriber.closed = ${errored.closed}`);
console.log(`after subscription.dispose():          subscriber.closed = ${disposedSub.closed}`);
console.log("expected: true in each case, as the typings tell");
if (completed.closed !== true || errored.closed !== true || disposedSub.closed !== true) {
  console.log("BUG PRESENT: the typings tell that the client sets IStreamSubscriber.closed on close, but nothing sets it.");
  process.exit(1);
}
console.log("OK");
process.exit(0);
