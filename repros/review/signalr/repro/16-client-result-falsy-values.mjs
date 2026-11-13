// R16: client results (server -> client invocation with an invocationId). In
// HubConnection._invokeClientMethod the "multiple results" check is `res && prevRes`, so a
// falsy result (0, "", false, null) does not count as a result:
//   - handlers returning 5 and 7  -> error "Client provided multiple results." (as designed)
//   - handlers returning 0 and 7  -> no error, the server gets 7
//   - handlers returning 7 and 0  -> no error, the server gets 0
// The same values give different outcomes depending on whether a value is falsy.
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

async function run(a, b) {
    const transport = new FakeTransport();
    const hub = new signalR.HubConnectionBuilder()
        .withUrl("http://fake.invalid/hub", { httpClient: new FakeHttpClient(), transport })
        .configureLogging(signalR.LogLevel.None)
        .build();
    hub.on("getValue", () => a);
    hub.on("getValue", () => b);
    await hub.start();
    transport.onreceive(JSON.stringify({ type: 1, invocationId: "1", target: "getValue", arguments: [] }) + RS);
    await new Promise((r) => setTimeout(r, 20));
    const c = transport.sent.find((m) => m.type === 3 && m.invocationId === "1");
    await hub.stop();
    return c.error ? `error "${c.error}"` : `result ${JSON.stringify(c.result)}`;
}

const outcomes = {};
for (const [a, b] of [[5, 7], [0, 7], [7, 0], [true, false]]) {
    outcomes[`${a},${b}`] = await run(a, b);
    console.log(`handlers return ${JSON.stringify(a)} and ${JSON.stringify(b)} -> Completion ${outcomes[`${a},${b}`]}`);
}
console.log("expected: every pair of two results gets the same treatment as 5 and 7 (an error)");
const inconsistent = Object.values(outcomes).some((o) => !o.startsWith("error"));
if (inconsistent) {
    console.log("BUG PRESENT: falsy client results are not counted by the multiple-results check.");
    process.exit(1);
}
console.log("OK");
process.exit(0);
