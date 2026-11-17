// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// The server invokes a client method that expects a result, and two handlers are registered for it.
// HubConnection._invokeClientMethod() must send an error ("Client provided multiple results.").
// The check is `if (expectsResponse && res && prevRes)`, so a falsy result (0, false, "", null)
// does not count. Thus the outcome depends on the order of the handlers: 5 and 7 give the error,
// but 0 and 7 give the result 7, 7 and 0 give the result 0, and true and false give false.
//
// Public API only: a custom HttpClient answers /negotiate, and an ITransport object records the frames.
import { HttpClient, HttpResponse, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { ITransport } from "@microsoft/signalr";

const RS = "\x1e";
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

interface Frame {
  readonly type?: number;
  readonly invocationId?: string;
  readonly result?: unknown;
  readonly error?: string;
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

async function run(a: unknown, b: unknown): Promise<string> {
  const transport = new FakeTransport();
  const hub = new HubConnectionBuilder()
    .withUrl("http://fake.invalid/hub", { httpClient: new FakeHttpClient(), transport })
    .configureLogging(LogLevel.None)
    .build();
  hub.on("getValue", () => a);
  hub.on("getValue", () => b);
  await hub.start();
  transport.onreceive?.(`${JSON.stringify({ type: 1, invocationId: "1", target: "getValue", arguments: [] })}${RS}`);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const c = transport.sent.find((m) => m.type === 3 && m.invocationId === "1");
  await hub.stop();
  if (c === undefined) return "no Completion";
  return c.error !== undefined ? `error "${c.error}"` : `result ${JSON.stringify(c.result)}`;
}

const outcomes: string[] = [];
for (const [a, b] of [
  [5, 7],
  [0, 7],
  [7, 0],
  [true, false],
] as const) {
  const outcome = await run(a, b);
  outcomes.push(outcome);
  console.log(`handlers return ${JSON.stringify(a)} and ${JSON.stringify(b)} -> Completion ${outcome}`);
}
console.log("expected: each pair of two results gets the same outcome as 5 and 7 (an error)");
if (outcomes.some((o) => !o.startsWith("error"))) {
  console.log("BUG PRESENT: the check for multiple results does not count a falsy client result.");
  process.exit(1);
}
console.log("OK");
process.exit(0);
