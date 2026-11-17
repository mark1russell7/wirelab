// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// One onclose, onreconnecting or onreconnected callback that throws stops the callbacks after it.
// HubConnection puts one try/catch around the whole forEach (_completeClose, _reconnect), so the
// first exception ends the loop.
//
// Public API only: a custom HttpClient answers /negotiate, and an ITransport object gives the frames.
import { HttpClient, HttpResponse, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import type { HttpRequest, ITransport } from "@microsoft/signalr";

const RS = "\x1e";

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
  private handshakeDone = false;
  async connect(): Promise<void> {
    this.handshakeDone = false;
  }
  async send(): Promise<void> {
    if (!this.handshakeDone) {
      this.handshakeDone = true;
      setTimeout(() => this.onreceive?.(`{}${RS}`), 0);
    }
  }
  async stop(): Promise<void> {
    this.onclose?.();
  }
  drop(): void {
    this.onclose?.(new Error("network drop"));
  }
}

const transport = new FakeTransport();
const hub = new HubConnectionBuilder()
  .withUrl("http://fake.invalid/hub", { httpClient: new FakeHttpClient(), transport })
  .withAutomaticReconnect([0])
  .configureLogging(LogLevel.None)
  .build();

const calls: string[] = [];
hub.onreconnecting(() => {
  calls.push("reconnecting#1");
  throw new Error("app bug in handler 1");
});
hub.onreconnecting(() => {
  calls.push("reconnecting#2");
});
const reconnected = new Promise<void>((resolve) => {
  hub.onreconnected(() => {
    calls.push("reconnected#1");
    setTimeout(resolve, 10);
    throw new Error("app bug in handler 1");
  });
});
hub.onreconnected(() => {
  calls.push("reconnected#2");
});
hub.onclose(() => {
  calls.push("close#1");
  throw new Error("app bug in handler 1");
});
hub.onclose(() => {
  calls.push("close#2");
});

await hub.start();
transport.drop(); // This starts the automatic reconnect.
await reconnected;
await hub.stop(); // This gives the onclose callbacks.

console.log(`callbacks that ran: ${calls.join(", ")}`);
const missing = ["reconnecting#2", "reconnected#2", "close#2"].filter((c) => !calls.includes(c));
console.log("expected: each registered callback runs, also when a callback before it throws");
if (missing.length > 0) {
  console.log(`BUG PRESENT: these callbacks did not run: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("OK: all callbacks ran.");
process.exit(0);
