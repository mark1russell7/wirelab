// R12: HubConnection._methods is a plain object ({}), indexed by the lower-cased method name.
// Names that exist on Object.prototype in lower case ("constructor", "__proto__") hit the
// prototype instead of a handler list:
//   - hub.on("constructor", fn) throws "this._methods[methodName].indexOf is not a function";
//   - a server Invocation with target "constructor" and an invocationId (a client-result call)
//     makes _invokeClientMethod throw on methods.slice(); no Completion is sent, so the server
//     call waits until its own timeout instead of getting "Client didn't provide a result.".
//
// Public API only: ITransport instance and a custom HttpClient.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const signalR = require("@microsoft/signalr");

const RS = "\x1e";
class FakeHttpClient extends signalR.HttpClient {
    async send() {
        return new signalR.HttpResponse(200, "OK", JSON.stringify({ connectionId: "c1", connectionToken: "t1", negotiateVersion: 1, availableTransports: [] }));
    }
}
class FakeTransport {
    constructor() { this.onreceive = null; this.onclose = null; this.sent = []; this.handshakeDone = false; }
    async connect() { }
    async send(data) {
        for (const frame of String(data).split(RS).filter(Boolean)) { this.sent.push(JSON.parse(frame)); }
        if (!this.handshakeDone) { this.handshakeDone = true; setTimeout(() => this.onreceive("{}" + RS), 0); }
    }
    async stop() { if (this.onclose) { this.onclose(); } }
}

const transport = new FakeTransport();
const hub = new signalR.HubConnectionBuilder()
    .withUrl("http://fake.invalid/hub", { httpClient: new FakeHttpClient(), transport })
    .configureLogging(signalR.LogLevel.None)
    .build();

let onError = "no error";
try { hub.on("constructor", () => {}); } catch (e) { onError = `${e.name}: ${e.message}`; }

await hub.start();
// Client-result calls from the server to methods the client did not register.
transport.onreceive(JSON.stringify({ type: 1, invocationId: "41", target: "notRegistered", arguments: [] }) + RS);
transport.onreceive(JSON.stringify({ type: 1, invocationId: "42", target: "constructor", arguments: [] }) + RS);
await new Promise((r) => setTimeout(r, 50));
const completions = transport.sent.filter((m) => m.type === 3).map((m) => `${m.invocationId}: ${m.error}`);
await hub.stop();

console.log(`hub.on("constructor", fn): ${onError}`);
console.log(`Completion messages sent for the server's client-result calls: ${JSON.stringify(completions)}`);
console.log(`expected: on() accepts the name, and each call (41 and 42) gets a Completion ("Client didn't provide a result.")`);
const missing42 = !completions.some((c) => c.startsWith("42:"));
if (onError !== "no error" || missing42) {
    console.log("BUG PRESENT: Object.prototype names are looked up on the prototype of the handler map.");
    process.exit(1);
}
console.log("OK");
process.exit(0);
