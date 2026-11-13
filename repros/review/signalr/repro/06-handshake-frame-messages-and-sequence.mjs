// R06: with withStatefulReconnect(), HubConnection creates its MessageBuffer only after the
// handshake promise resolves (HubConnection._startInternal). Messages that arrive in the same
// frame as the handshake response (or in the same tick) are handled before that:
//   A) first start: no buffer yet, so they are delivered but NOT counted. The client's sequence
//      numbers are then one behind the server's, and after a stateful reconnect the server's
//      resend is delivered to the app a second time (duplicate delivery).
//   B) start after withAutomaticReconnect(): the OLD buffer is still in place and is waiting for
//      a Sequence message, so these messages are silently dropped (message loss).
//
// In-process only: a custom HttpClient for /negotiate, options.WebSocket is a fake class, and the
// fake server follows the Ack/Sequence rules of HubProtocol.md.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const signalR = require("@microsoft/signalr");

const RS = "\x1e";
const inv = (target, arg) => JSON.stringify({ type: 1, target, arguments: [arg] }) + RS;

async function scenario(name, plan) {
    let negotiateCount = 0;
    class FakeHttpClient extends signalR.HttpClient {
        async send(request) {
            if (request.url.includes("/negotiate")) {
                negotiateCount++;
                return new signalR.HttpResponse(200, "OK", JSON.stringify({
                    connectionId: `c${negotiateCount}`, connectionToken: `tok${negotiateCount}`, negotiateVersion: 1,
                    useStatefulReconnect: true,
                    availableTransports: [{ transport: "WebSockets", transferFormats: ["Text", "Binary"] }],
                }));
            }
            return new signalR.HttpResponse(404, "Not Found", "");
        }
    }
    // Server side state of each logical connection (by token): the messages it sent with their sequence ids.
    const serverConn = new Map();
    const sockets = [];
    class FakeWebSocket {
        static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
        constructor(url) {
            this.url = url; this.readyState = 0;
            this.token = new URL(url.replace(/^ws/, "http")).searchParams.get("id");
            this.index = sockets.push(this);
            setTimeout(() => {
                if (plan.failSocket === this.index) { this.readyState = 3; this.onclose({ code: 1006, wasClean: false, reason: "" }); return; }
                this.readyState = 1; this.onopen({});
            }, 5);
        }
        state() {
            if (!serverConn.has(this.token)) { serverConn.set(this.token, { sent: [], acked: 0 }); }
            return serverConn.get(this.token);
        }
        // server sends a trackable message: it gets the next sequence id of this logical connection
        push(target, arg) { const s = this.state(); s.sent.push({ seq: s.sent.length + 1, frame: inv(target, arg) }); return inv(target, arg); }
        send(data) {
            for (const frame of String(data).split(RS).filter(Boolean)) {
                const msg = JSON.parse(frame);
                if (msg.protocol) {
                    // handshake response and one app message in the SAME frame
                    const first = this.push("msg", plan.firstMessage(this.index));
                    setTimeout(() => this.onmessage({ data: "{}" + RS + first }), 1);
                } else if (msg.type === 8) {
                    this.state().acked = Math.max(this.state().acked, msg.sequenceId);
                } else if (msg.type === 9) {
                    // client resumed this logical connection: Sequence + resend of every unacked message
                    const s = this.state();
                    const resend = s.sent.filter((m) => m.seq > s.acked);
                    const data = JSON.stringify({ type: 9, sequenceId: s.acked + 1 }) + RS + resend.map((m) => m.frame).join("");
                    setTimeout(() => this.onmessage({ data }), 1);
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
    const delivered = [];
    hub.on("msg", (x) => delivered.push(x));
    const reconnected = new Promise((r) => hub.onreconnected(r));

    await hub.start();
    await new Promise((r) => setTimeout(r, 20));
    // a second app message in its own frame
    sockets[0].onmessage({ data: sockets[0].push("msg", "second") });
    await new Promise((r) => setTimeout(r, 20));
    sockets[0].drop();
    if (plan.waitReconnected) { await reconnected; }
    await new Promise((r) => setTimeout(r, 100));
    await hub.stop().catch(() => {});
    console.log(`[${name}] app saw: ${JSON.stringify(delivered)}; expected: ${JSON.stringify(plan.expected)}`);
    return JSON.stringify(delivered) === JSON.stringify(plan.expected);
}

// A: first start, stateful reconnect of the same logical connection succeeds.
const okA = await scenario("A first start, then stateful reconnect", {
    firstMessage: () => "first", expected: ["first", "second"],
});
// B: stateful reconnect fails (socket 2), automatic reconnect opens a new connection (socket 3)
//    whose handshake frame carries "welcome".
const okB = await scenario("B automatic reconnect after a failed stateful reconnect", {
    failSocket: 2, waitReconnected: true,
    firstMessage: (i) => (i === 1 ? "first" : "welcome"), expected: ["first", "second", "welcome"],
});

if (!okA || !okB) {
    console.log(`BUG PRESENT: ${!okA ? "A: a message was delivered twice after a stateful reconnect. " : ""}${!okB ? "B: a message in the handshake frame was dropped." : ""}`);
    process.exit(1);
}
console.log("OK");
process.exit(0);
