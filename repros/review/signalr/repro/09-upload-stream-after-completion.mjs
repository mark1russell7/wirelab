// R09: HubProtocol.md, "Upload streaming": "If the Callee sends a Completion the Caller should stop
// sending StreamItem and Completion messages". HubConnection._launchStreams() subscribes to each
// upload stream and never disposes the subscription, so after the server has completed the
// invocation the client still sends every StreamItem and the final Completion of the upload
// stream. The same holds after stream().dispose() (CancelInvocation) of a stream() call with an
// upload argument.
//
// Public API only: custom HttpClient for /negotiate, ITransport instance records the frames.
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
            const msg = JSON.parse(frame);
            this.sent.push(msg);
            // The server method completes as soon as it gets the invocation (for example it rejects the upload).
            if (msg.type === 1 && msg.invocationId) {
                setTimeout(() => this.onreceive(JSON.stringify({ type: 3, invocationId: msg.invocationId, error: "upload rejected" }) + RS), 0);
            }
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

const upload = new signalR.Subject();
const result = await hub.invoke("Upload", upload).then(() => "resolved", (e) => `rejected: ${e.message}`);
const invocation = transport.sent.find((m) => m.type === 1 && m.target === "Upload");
const streamId = invocation.streamIds[0];

// The application keeps producing data for the upload.
for (let i = 0; i < 3; i++) { upload.next(i); }
upload.complete();
await new Promise((r) => setTimeout(r, 50));

const afterCompletion = transport.sent.filter((m) => (m.type === 2 || m.type === 3) && m.invocationId === streamId);
await hub.stop();

console.log(`hub.invoke("Upload", subject): ${result} (the server sent Completion)`);
console.log(`messages for upload stream ${streamId} sent after the server's Completion: ${afterCompletion.length} ${JSON.stringify(afterCompletion)}`);
console.log("expected: 0 (the client stops the upload stream when the invocation completes)");
if (afterCompletion.length > 0) {
    console.log("BUG PRESENT: the upload stream is still sent after the server completed the invocation; the subscription is never disposed.");
    process.exit(1);
}
console.log("OK");
process.exit(0);
