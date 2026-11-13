// R10: two public promises reject with a plain string, not an Error:
//   a) WebSocketTransport.send(): Promise.reject("WebSocket is not in the OPEN state")
//      - reached by hub.send()/invoke() while the socket is CLOSING (the close handshake is in
//        progress, onclose has not fired yet, HttpConnection is still Connected).
//   b) TransportSendQueue._sendLoop(): this._transportResult.reject("Connection stopped.")
//      - reached by hub.send() calls that were queued behind an in-flight send when the
//        connection stops.
// Callers that read error.message, error.name or instanceof Error get undefined/false, and
// there is no stack.
//
// In-process only: options.WebSocket is a fake class (a), an ITransport instance (b), and a
// custom HttpClient for /negotiate.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const signalR = require("@microsoft/signalr");

const RS = "\x1e";
const describe = (reason) => `${typeof reason} ${reason instanceof Error ? "(Error)" : "(not an Error)"}: ${JSON.stringify(reason instanceof Error ? reason.message : reason)}`;

// ---- a) WebSocket in the CLOSING state
class FakeWebSocket {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    static last;
    constructor(url) { this.url = url; this.readyState = 0; FakeWebSocket.last = this; setTimeout(() => { this.readyState = 1; this.onopen({}); }, 1); }
    send(data) { if (String(data).includes("\"protocol\"")) { setTimeout(() => this.onmessage({ data: "{}" + RS }), 1); } }
    close() { this.readyState = 3; }
}
const hubA = new signalR.HubConnectionBuilder()
    .withUrl("http://fake.invalid/hub", { skipNegotiation: true, transport: signalR.HttpTransportType.WebSockets, WebSocket: FakeWebSocket })
    .configureLogging(signalR.LogLevel.None)
    .build();
await hubA.start();
FakeWebSocket.last.readyState = FakeWebSocket.CLOSING;     // server started the close handshake
let reasonA;
await hubA.send("Hello").catch((e) => { reasonA = e; });
await hubA.stop();
console.log(`a) hub.send() while the WebSocket is CLOSING rejected with ${describe(reasonA)}`);

// ---- b) sends queued behind an in-flight send when the connection stops
class FakeHttpClient extends signalR.HttpClient {
    async send(request) {
        return new signalR.HttpResponse(200, "OK", JSON.stringify({ connectionId: "c1", connectionToken: "t1", negotiateVersion: 1, availableTransports: [] }));
    }
}
class SlowTransport {
    constructor() { this.onreceive = null; this.onclose = null; this.handshakeDone = false; this.release = null; }
    async connect() { }
    send(data) {
        if (!this.handshakeDone) { this.handshakeDone = true; setTimeout(() => this.onreceive("{}" + RS), 0); return Promise.resolve(); }
        if (String(data).includes("\"First\"")) { return new Promise((r) => { this.release = r; }); }   // slow network write
        return Promise.resolve();
    }
    async stop() { if (this.onclose) { this.onclose(); } }
}
const slow = new SlowTransport();
const hubB = new signalR.HubConnectionBuilder()
    .withUrl("http://fake.invalid/hub", { httpClient: new FakeHttpClient(), transport: slow })
    .configureLogging(signalR.LogLevel.None)
    .build();
await hubB.start();
hubB.send("First").catch(() => {});
await new Promise((r) => setTimeout(r, 10));
let reasonB;
const second = hubB.send("Second").catch((e) => { reasonB = e; });
await hubB.stop();
slow.release();
await second;
console.log(`b) hub.send() queued when the connection stopped rejected with ${describe(reasonB)}`);
console.log("expected: both reject with an Error instance");

const bad = [reasonA, reasonB].filter((r) => !(r instanceof Error));
if (bad.length) {
    console.log(`BUG PRESENT: ${bad.length} rejection(s) are plain strings, not Error objects.`);
    process.exit(1);
}
console.log("OK");
process.exit(0);
