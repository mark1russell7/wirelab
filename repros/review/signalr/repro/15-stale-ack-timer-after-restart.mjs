// R15: MessageBuffer._dispose() does not clear the 1-second Ack timer (_ackTimerHandle), and the
// timer sends through the shared HttpConnection object. If the app stops and starts the
// HubConnection within that second (for example to switch user or token), the OLD buffer's
// timer fires on the NEW connection and sends Ack{sequenceId: <count of the old connection>}.
// HubProtocol.md: the Ack sequenceId is "how many trackable messages have been received" on this
// connection; the new connection has received none. A server that trusts it releases messages
// from its resend buffer that the client never received.
//
// In-process only: a custom HttpClient for /negotiate and options.WebSocket as a fake class.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const signalR = require("@microsoft/signalr");

const RS = "\x1e";
let negotiateCount = 0;
class FakeHttpClient extends signalR.HttpClient {
    async send(request) {
        negotiateCount++;
        return new signalR.HttpResponse(200, "OK", JSON.stringify({
            connectionId: `c${negotiateCount}`, connectionToken: `tok${negotiateCount}`, negotiateVersion: 1, useStatefulReconnect: true,
            availableTransports: [{ transport: "WebSockets", transferFormats: ["Text", "Binary"] }],
        }));
    }
}
const sockets = [];
class FakeWebSocket {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    constructor(url) {
        this.url = url; this.readyState = 0; this.received = []; sockets.push(this);
        setTimeout(() => { this.readyState = 1; this.onopen({}); }, 1);
    }
    send(data) {
        for (const frame of String(data).split(RS).filter(Boolean)) {
            const msg = JSON.parse(frame);
            this.received.push(msg);
            if (msg.protocol) { setTimeout(() => this.onmessage({ data: "{}" + RS }), 1); }
        }
    }
    close() { this.readyState = 3; }
}

const hub = new signalR.HubConnectionBuilder()
    .withUrl("http://fake.invalid/hub", { httpClient: new FakeHttpClient(), WebSocket: FakeWebSocket, transport: signalR.HttpTransportType.WebSockets })
    .withStatefulReconnect()
    .configureLogging(signalR.LogLevel.None)
    .build();
hub.on("msg", () => {});

await hub.start();
for (let i = 1; i <= 3; i++) {
    sockets[0].onmessage({ data: JSON.stringify({ type: 1, target: "msg", arguments: [i] }) + RS });
}
// restart at once (well inside the 1 s ack delay)
await hub.stop();
await hub.start();
await new Promise((r) => setTimeout(r, 1300));
const acksOnNew = sockets[1].received.filter((m) => m.type === 8).map((m) => m.sequenceId);
await hub.stop();

console.log("old connection: 3 trackable messages received; new connection: 0 trackable messages received");
console.log(`Ack messages sent on the NEW connection: ${JSON.stringify(acksOnNew)}`);
console.log("expected: no Ack with a sequenceId above 0 on the new connection");
if (acksOnNew.some((id) => id > 0)) {
    console.log("BUG PRESENT: the disposed MessageBuffer's Ack timer sent the old connection's sequence id on the new connection.");
    process.exit(1);
}
console.log("OK");
process.exit(0);
