// R11: with a binary hub protocol (MessagePack), HandshakeProtocol.parseHandshakeResponse()
// turns the handshake bytes into text with String.fromCharCode.apply(...), one char per BYTE,
// i.e. Latin-1. The handshake is UTF-8 JSON (HubProtocol.md), so any non-ASCII text in it, such
// as a localized "error" from the server, is garbled ("ü" becomes "Ã¼"). The text path is right.
//
// Public API only: a minimal binary IHubProtocol, an ITransport instance and a custom HttpClient.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const signalR = require("@microsoft/signalr");

const serverError = "Protokoll „messagepack“ wird nicht unterstützt";

class FakeHttpClient extends signalR.HttpClient {
    async send() {
        return new signalR.HttpResponse(200, "OK", JSON.stringify({ connectionId: "c1", connectionToken: "t1", negotiateVersion: 1, availableTransports: [] }));
    }
}
class BinaryTransport {
    constructor() { this.onreceive = null; this.onclose = null; }
    async connect() { }
    async send() {
        // The server answers the handshake in a binary frame: UTF-8 JSON + 0x1e.
        const bytes = new TextEncoder().encode(JSON.stringify({ error: serverError }) + "\x1e");
        const exact = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        setTimeout(() => this.onreceive(exact), 0);
    }
    async stop() { if (this.onclose) { this.onclose(); } }
}
const binaryProtocol = {
    name: "messagepack", version: 2, transferFormat: signalR.TransferFormat.Binary,
    parseMessages() { return []; },
    writeMessage() { return new Uint8Array([0]).buffer; },
};

const hub = new signalR.HubConnectionBuilder()
    .withUrl("http://fake.invalid/hub", { httpClient: new FakeHttpClient(), transport: new BinaryTransport() })
    .withHubProtocol(binaryProtocol)
    .configureLogging(signalR.LogLevel.None)
    .build();

const message = await hub.start().then(() => "(resolved)", (e) => e.message);
console.log(`hub.start() rejected with: ${message}`);
console.log(`expected it to contain:    ${serverError}`);
if (!message.includes(serverError)) {
    console.log("BUG PRESENT: the binary handshake response is decoded as Latin-1, not UTF-8.");
    process.exit(1);
}
console.log("OK");
process.exit(0);
