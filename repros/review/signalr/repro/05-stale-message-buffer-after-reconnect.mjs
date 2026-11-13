// R05: after a stateful-reconnect attempt fails and withAutomaticReconnect() starts a new
// connection that does NOT use stateful reconnect (the new negotiate says
// useStatefulReconnect:false, or the client falls back to SSE / long polling), HubConnection keeps
// the old MessageBuffer. That buffer is still in "reconnect in progress" and "wait for Sequence"
// mode, so:
//   - _sendWithProtocol() goes to the old buffer, which never sends: invoke()/send() hang;
//   - _processIncomingData() asks the old buffer, which drops every message until a Sequence
//     message arrives (a non-stateful server never sends one).
// onreconnected fires, pings still flow (they bypass the buffer), so nothing times out.
//
// In-process only: a custom HttpClient answers /negotiate, and options.WebSocket is a fake class.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const signalR = require("@microsoft/signalr");

const RS = "\x1e";
let negotiateCount = 0;

class FakeHttpClient extends signalR.HttpClient {
    async send(request) {
        if (request.url.includes("/negotiate")) {
            negotiateCount++;
            return new signalR.HttpResponse(200, "OK", JSON.stringify({
                connectionId: `c${negotiateCount}`, connectionToken: `tok${negotiateCount}`, negotiateVersion: 1,
                useStatefulReconnect: negotiateCount === 1,       // the second server does not offer it
                availableTransports: [{ transport: "WebSockets", transferFormats: ["Text", "Binary"] }],
            }));
        }
        return new signalR.HttpResponse(404, "Not Found", "");
    }
}

const sockets = [];
class FakeWebSocket {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    constructor(url) {
        this.url = url; this.readyState = 0; this.received = [];
        this.onopen = this.onclose = this.onmessage = this.onerror = null;
        const index = sockets.push(this);
        setTimeout(() => {
            if (index === 2) {           // the stateful reconnect to the old connection token fails (server lost it)
                this.readyState = 3; this.onclose({ code: 1006, wasClean: false, reason: "" });
            } else {
                this.readyState = 1; this.onopen({});
            }
        }, 5);
    }
    send(data) {
        for (const frame of String(data).split(RS).filter(Boolean)) {
            const msg = JSON.parse(frame);
            this.received.push(msg);
            if (msg.protocol) { setTimeout(() => this.onmessage({ data: "{}" + RS }), 1); }
            if (msg.type === 1 && msg.invocationId) {
                setTimeout(() => this.onmessage({ data: JSON.stringify({ type: 3, invocationId: msg.invocationId, result: "pong" }) + RS }), 1);
            }
        }
    }
    close() { this.readyState = 3; }
    drop() { this.readyState = 3; this.onclose({ code: 1006, wasClean: false, reason: "" }); }
}

const hub = new signalR.HubConnectionBuilder()
    .withUrl("http://fake.invalid/hub", { httpClient: new FakeHttpClient(), WebSocket: FakeWebSocket, transport: signalR.HttpTransportType.WebSockets })
    .withStatefulReconnect()
    .withAutomaticReconnect([0])
    .configureLogging(signalR.LogLevel.None)
    .build();

const news = [];
hub.on("news", (x) => news.push(x));
const reconnected = new Promise((r) => hub.onreconnected(r));

await hub.start();
sockets[0].drop();
await reconnected;

const ws3 = sockets[2];
const invokeResult = await Promise.race([
    hub.invoke("Ping").then((r) => `resolved: ${r}`, (e) => `rejected: ${e}`),
    new Promise((r) => setTimeout(() => r("still pending after 1000 ms"), 1000)),
]);
ws3.onmessage({ data: JSON.stringify({ type: 1, target: "news", arguments: ["hello"] }) + RS });
await new Promise((r) => setTimeout(r, 50));

const invocationsOnNewSocket = ws3.received.filter((m) => m.type === 1).length;
console.log(`negotiates: ${negotiateCount}; sockets: ${sockets.length}; hub.state: ${hub.state}`);
console.log(`hub.invoke("Ping") after onreconnected: ${invokeResult}`);
console.log(`Invocation messages that reached the new socket: ${invocationsOnNewSocket}`);
console.log(`hub.on("news") calls for a message the server sent on the new socket: ${news.length}`);
console.log("expected: the invocation is sent and answered, and the server message is delivered");

await hub.stop().catch(() => {});
if (invocationsOnNewSocket === 0 || news.length === 0) {
    console.log("BUG PRESENT: the stale MessageBuffer of the old connection blocks all sends and drops all receives.");
    process.exit(1);
}
console.log("OK");
process.exit(0);
