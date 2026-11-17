// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// With a binary hub protocol (MessagePack), HandshakeProtocol.parseHandshakeResponse() changes the
// bytes of the handshake into text with String.fromCharCode.apply(...), one character for each BYTE.
// That is Latin-1. The handshake is UTF-8 JSON (HubProtocol.md), so the client garbles each
// character that is not ASCII, for example in a localized "error" of the server ("ü" becomes "Ã¼").
// The text path is correct.
//
// Public API only: a minimal binary IHubProtocol, an ITransport object and a custom HttpClient.
import { HttpClient, HttpResponse, HubConnectionBuilder, LogLevel, TransferFormat } from "@microsoft/signalr";
import type { IHubProtocol, ITransport } from "@microsoft/signalr";

const serverError = "Protokoll „messagepack“ wird nicht unterstützt";
setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

class FakeHttpClient extends HttpClient {
  override async send(): Promise<HttpResponse> {
    const negotiate = { connectionId: "c1", connectionToken: "t1", negotiateVersion: 1, availableTransports: [] };
    return new HttpResponse(200, "OK", JSON.stringify(negotiate));
  }
}
class BinaryTransport implements ITransport {
  onreceive: ((data: string | ArrayBuffer) => void) | null = null;
  onclose: ((error?: Error) => void) | null = null;
  async connect(): Promise<void> {}
  async send(): Promise<void> {
    // The server answers the handshake in a binary frame: UTF-8 JSON and 0x1e.
    const bytes = new TextEncoder().encode(`${JSON.stringify({ error: serverError })}\x1e`);
    const exact = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    setTimeout(() => {
      try {
        this.onreceive?.(exact);
      } catch {
        // HubConnection rejects start() and then throws the handshake error to the transport.
        // WebSocketTransport catches it and closes, so this fake transport catches it too.
      }
    }, 0);
  }
  async stop(): Promise<void> {
    this.onclose?.();
  }
}
const binaryProtocol: IHubProtocol = {
  name: "messagepack",
  version: 2,
  transferFormat: TransferFormat.Binary,
  parseMessages: () => [],
  writeMessage: () => new Uint8Array([0]).buffer,
};

const hub = new HubConnectionBuilder()
  .withUrl("http://fake.invalid/hub", { httpClient: new FakeHttpClient(), transport: new BinaryTransport() })
  .withHubProtocol(binaryProtocol)
  .configureLogging(LogLevel.None)
  .build();

const message = await hub.start().then(
  () => "(resolved)",
  (e: unknown) => (e as Error).message,
);
console.log(`hub.start() rejected with: ${message}`);
console.log(`expected it to contain:    ${serverError}`);
if (!message.includes(serverError)) {
  console.log("BUG PRESENT: the client decodes the binary handshake response as Latin-1, not as UTF-8.");
  process.exit(1);
}
console.log("OK");
process.exit(0);
