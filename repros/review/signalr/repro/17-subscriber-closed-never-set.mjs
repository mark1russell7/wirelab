// R17: the published typings document IStreamSubscriber.closed as
//   "A boolean that will be set by the IStreamResult when the stream is closed."
// (Stream.ts / dist/esm/Stream.d.ts). No code sets it: after the server completes or errors the
// stream, or after subscription.dispose(), subscriber.closed stays undefined.
//
// Public API only: ITransport instance and a custom HttpClient.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const signalR = require("@microsoft/signalr");

const dts = fs.readFileSync(require.resolve("@microsoft/signalr/dist/esm/Stream.d.ts"), "utf8");
const doc = (dts.match(/\/\*\*([^*]|\*(?!\/))*\*\/\s*closed\?: boolean;/) || ["(not found)"])[0].replace(/\s+/g, " ");
console.log(`Stream.d.ts: ${doc}`);

const RS = "\x1e";
class FakeHttpClient extends signalR.HttpClient {
    async send() {
        return new signalR.HttpResponse(200, "OK", JSON.stringify({ connectionId: "c1", connectionToken: "t1", negotiateVersion: 1, availableTransports: [] }));
    }
}
class FakeTransport {
    constructor() { this.onreceive = null; this.onclose = null; this.handshakeDone = false; }
    async connect() { }
    async send(data) {
        if (!this.handshakeDone) { this.handshakeDone = true; setTimeout(() => this.onreceive("{}" + RS), 0); return; }
        for (const frame of String(data).split(RS).filter(Boolean)) {
            const msg = JSON.parse(frame);
            if (msg.type === 4) {   // StreamInvocation: one item, then completion (or error)
                const done = msg.target === "Fails" ? { type: 3, invocationId: msg.invocationId, error: "boom" } : { type: 3, invocationId: msg.invocationId };
                setTimeout(() => this.onreceive(JSON.stringify({ type: 2, invocationId: msg.invocationId, item: 1 }) + RS + JSON.stringify(done) + RS), 0);
            }
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

const subscriber = (onDone) => ({ next() {}, error() { onDone(); }, complete() { onDone(); } });
const completed = await new Promise((r) => { const s = subscriber(() => r(s)); hub.stream("Counter").subscribe(s); });
const errored = await new Promise((r) => { const s = subscriber(() => r(s)); hub.stream("Fails").subscribe(s); });
const disposedSub = { next() {}, error() {}, complete() {} };
hub.stream("Never").subscribe(disposedSub).dispose();
await hub.stop();

console.log(`after the server completed the stream: subscriber.closed = ${completed.closed}`);
console.log(`after the server errored the stream:   subscriber.closed = ${errored.closed}`);
console.log(`after subscription.dispose():          subscriber.closed = ${disposedSub.closed}`);
console.log("expected: true in each case, as the typings say");
if (completed.closed !== true || errored.closed !== true || disposedSub.closed !== true) {
    console.log("BUG PRESENT: IStreamSubscriber.closed is documented as set on close but is never set.");
    process.exit(1);
}
console.log("OK");
process.exit(0);
