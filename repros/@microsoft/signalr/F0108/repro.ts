// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// HubConnection._methods is a plain object ({}), with the method name in lower case as its key.
// The names of Object.prototype in lower case ("constructor", "__proto__") find the prototype in
// place of a list of handlers:
//   - hub.on("constructor", fn) throws "this._methods[methodName].indexOf is not a function".
//   - A server Invocation with the target "constructor" and an invocationId (a client-result call)
//     makes _invokeClientMethod throw on methods.slice(). The client sends no Completion, so the
//     server call waits for its own timeout in place of the error "Client didn't provide a result.".
//
// Public API only: a custom HttpClient answers /negotiate, and an ITransport object records the frames.
import { HttpClient, HttpResponse, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { ITransport } from "@microsoft/signalr";

const RS = "\x1e";

interface Frame {
  readonly type?: number;
  readonly invocationId?: string;
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

const transport = new FakeTransport();
const hub = new HubConnectionBuilder()
  .withUrl("http://fake.invalid/hub", { httpClient: new FakeHttpClient(), transport })
  .configureLogging(LogLevel.None)
  .build();

let onError = "no error";
try {
  hub.on("constructor", () => {});
} catch (error) {
  onError = `${(error as Error).name}: ${(error as Error).message}`;
}

await hub.start();
// The server calls two client methods for a result. The client registered neither of them.
transport.onreceive?.(`${JSON.stringify({ type: 1, invocationId: "41", target: "notRegistered", arguments: [] })}${RS}`);
transport.onreceive?.(`${JSON.stringify({ type: 1, invocationId: "42", target: "constructor", arguments: [] })}${RS}`);
await new Promise((resolve) => setTimeout(resolve, 50));
const completions = transport.sent.filter((m) => m.type === 3).map((m) => `${m.invocationId}: ${m.error}`);
await hub.stop();

console.log(`hub.on("constructor", fn): ${onError}`);
console.log(`Completion messages sent for the client-result calls of the server: ${JSON.stringify(completions)}`);
console.log(`expected: on() accepts the name, and each call (41 and 42) gets a Completion ("Client didn't provide a result.")`);
const missing42 = !completions.some((c) => c.startsWith("42:"));
if (onError !== "no error" || missing42) {
  console.log("BUG PRESENT: the client finds the names of Object.prototype on the prototype of the map of handlers.");
  process.exit(1);
}
console.log("OK");
process.exit(0);
