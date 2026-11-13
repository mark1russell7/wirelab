// R02: one throwing onclose / onreconnecting / onreconnected callback stops the
// callbacks registered after it. HubConnection wraps the whole forEach in one try/catch
// (_completeClose, _reconnect), so the first exception ends the loop.
//
// Public API only: custom HttpClient for /negotiate, ITransport instance for the frames.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const signalR = require("@microsoft/signalr");

const RS = "\x1e";

class FakeHttpClient extends signalR.HttpClient {
    async send(request) {
        if (request.url.includes("/negotiate")) {
            return new signalR.HttpResponse(200, "OK", JSON.stringify({
                connectionId: "c1", connectionToken: "t1", negotiateVersion: 1, availableTransports: [],
            }));
        }
        return new signalR.HttpResponse(200, "OK", "");
    }
}

class FakeTransport {
    constructor() { this.onreceive = null; this.onclose = null; this.handshakeDone = false; }
    async connect() { this.handshakeDone = false; }
    async send() {
        if (!this.handshakeDone) {
            this.handshakeDone = true;
            setTimeout(() => this.onreceive("{}" + RS), 0);
        }
    }
    async stop() { if (this.onclose) { this.onclose(); } }
    drop() { if (this.onclose) { this.onclose(new Error("network drop")); } }
}

const transport = new FakeTransport();
const hub = new signalR.HubConnectionBuilder()
    .withUrl("http://fake.invalid/hub", { httpClient: new FakeHttpClient(), transport })
    .withAutomaticReconnect([0])
    .configureLogging(signalR.LogLevel.None)
    .build();

const calls = [];
hub.onreconnecting(() => { calls.push("reconnecting#1"); throw new Error("app bug in handler 1"); });
hub.onreconnecting(() => { calls.push("reconnecting#2"); });
const reconnected = new Promise((resolve) => {
    hub.onreconnected(() => { calls.push("reconnected#1"); setTimeout(resolve, 10); throw new Error("app bug in handler 1"); });
});
hub.onreconnected(() => { calls.push("reconnected#2"); });
hub.onclose(() => { calls.push("close#1"); throw new Error("app bug in handler 1"); });
hub.onclose(() => { calls.push("close#2"); });

await hub.start();
transport.drop();                 // starts the automatic reconnect
await reconnected;
await hub.stop();                 // fires onclose

console.log("callbacks that ran:", calls.join(", "));
const missing = ["reconnecting#2", "reconnected#2", "close#2"].filter((c) => !calls.includes(c));
console.log("expected: every registered callback runs, even if an earlier one throws");
if (missing.length) {
    console.log(`BUG PRESENT: these callbacks never ran: ${missing.join(", ")}`);
    process.exit(1);
}
console.log("OK: all callbacks ran.");
process.exit(0);
