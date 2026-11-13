// R01: HubConnection.send()/invoke()/stream() with two stream arguments next to each other.
// _replaceStreamingParams() splices args[i] inside a forward for-loop and then does i++,
// so the argument after a removed stream is never checked. The second stream is sent as a
// plain JSON argument and gets no stream id.
//
// Uses only the public API: a custom HttpClient answers /negotiate, and an ITransport instance
// records the frames the client sends. No network.
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
    constructor() { this.onreceive = null; this.onclose = null; this.sent = []; this.handshakeDone = false; }
    async connect() { }
    async send(data) {
        for (const frame of String(data).split(RS).filter(Boolean)) {
            this.sent.push(JSON.parse(frame));
        }
        if (!this.handshakeDone) {
            this.handshakeDone = true;
            setTimeout(() => this.onreceive("{}" + RS), 0);
        }
    }
    async stop() { if (this.onclose) { this.onclose(); } }
}

const transport = new FakeTransport();
const hub = new signalR.HubConnectionBuilder()
    .withUrl("http://fake.invalid/hub", { httpClient: new FakeHttpClient(), transport })
    .configureLogging(signalR.LogLevel.None)
    .build();

await hub.start();

const s1 = new signalR.Subject();
const s2 = new signalR.Subject();
await hub.send("UploadTwo", s1, s2);

const invocation = transport.sent.find((m) => m.type === 1 && m.target === "UploadTwo");
await hub.stop();

console.log("sent invocation:", JSON.stringify(invocation));
const argsCount = invocation.arguments.length;
const streamIdCount = (invocation.streamIds || []).length;
console.log(`expected: arguments=[] and 2 streamIds; saw: ${argsCount} argument(s) and ${streamIdCount} streamId(s)`);

if (argsCount !== 0 || streamIdCount !== 2) {
    console.log("BUG PRESENT: the second adjacent stream argument was serialized as a plain argument and got no stream id.");
    process.exit(1);
}
console.log("OK: both streams got stream ids.");
process.exit(0);
