// Repro: avsc 5.7.9, the protocols that Client.remoteProtocols() gives do not
// work as the remoteProtocols option of a new client.
//
// The client cache is keyed by `cache[hash]`, with a Buffer hash, so the key is
// the hash decoded as UTF-8: each byte of 0x80 or more becomes U+FFFD. The
// option stores that key string as the hash of the adapter, and the next
// handshake writes the string as an MD5 fixed value. The write throws in
// process.nextTick, so the process ends.
import { PassThrough } from "node:stream";
import avscTyped from "avsc";

// The bundled types of 5.7.9 declare the remoteProtocols option as boolean and
// remoteProtocols() as any[], so this repro uses the library untyped.
const avsc = avscTyped as any;

const serverSvc = avsc.Service.forProtocol({
  protocol: "S",
  messages: { neg: { request: [{ name: "n", type: "long" }], response: "int" } },
});
const clientSvc = avsc.Service.forProtocol({
  protocol: "C",
  messages: { neg: { request: [{ name: "n", type: "int" }], response: "long" } },
});
const server = serverSvc.createServer().onMessage("neg", (req: { n: number }, cb: (err: null, res: number) => void) => cb(null, -req.n));

function connect() {
  const toServer = new PassThrough();
  const toClient = new PassThrough();
  server.createChannel({ readable: toServer, writable: toClient });
  return { readable: toClient, writable: toServer };
}

process.on("uncaughtException", (error) => {
  console.log(`second client: uncaught ${error.message.slice(0, 60)}...`);
  console.log("BUG PRESENT");
  process.exit(0);
});

const first = clientSvc.createClient();
first.createChannel(connect());
first.emitMessage("neg", { n: 2 }, {}, (err: unknown, res: number) => {
  const saved: Record<string, unknown> = first.remoteProtocols();
  const key = Object.keys(saved)[0]!;
  console.log(`first client: result ${res}`);
  console.log(`server hash ${serverSvc.hash.toString("hex")}, cache key (UTF-8) ${Buffer.from(key, "utf8").toString("hex")}`);

  const second = clientSvc.createClient({ remoteProtocols: saved });
  second.createChannel(connect(), { serverHash: serverSvc.hash });
  second.emitMessage("neg", { n: 3 }, {}, (err2: unknown, res2: number) => {
    console.log(`second client: error ${err2 === null ? "none" : String(err2)}, result ${res2}`);
    console.log(res2 === -3 ? "BUG ABSENT" : "BUG PRESENT");
    process.exit(0);
  });
});
