// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// The option servers lists 2 TLS brokers, mqtt-a.example and mqtt-b.example. The first connect sets
// opts.servername to "mqtt-a.example" (connect/tls.ts). After the failover, the wrapper changes opts.host, but
// servername keeps the first name. Thus the TLS ClientHello to mqtt-b.example sends the SNI "mqtt-a.example", and the
// client checks the certificate of the second broker against the first name.
//
// The two servers here are plain TCP servers on 127.0.0.1. Each reads the SNI of the ClientHello and closes the socket.
// The option lookup sends each name to 127.0.0.1, so no DNS is used.
import dns from "node:dns";
import net from "node:net";
import type { AddressInfo } from "node:net";
import mqtt from "mqtt";
import type { IClientOptions } from "mqtt";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

// The server name of a TLS ClientHello (RFC 8446 section 4.1.2, RFC 6066 section 3), or undefined.
function serverName(hello: Buffer): string | undefined {
  let at = 5 + 4 + 2 + 32;
  if (hello.length < at + 1 || hello[0] !== 0x16) return undefined;
  at += 1 + hello.readUInt8(at);
  at += 2 + hello.readUInt16BE(at);
  at += 1 + hello.readUInt8(at);
  const end = at + 2 + hello.readUInt16BE(at);
  at += 2;
  while (at + 4 <= end) {
    const type = hello.readUInt16BE(at);
    const length = hello.readUInt16BE(at + 2);
    if (type === 0) return hello.subarray(at + 9, at + 9 + hello.readUInt16BE(at + 7)).toString("latin1");
    at += 4 + length;
  }
  return undefined;
}

const seen: Array<{ server: string; sni: string | undefined }> = [];
const listen = async (name: string): Promise<number> => {
  const server = net.createServer((socket) => {
    socket.once("data", (data) => {
      seen.push({ server: name, sni: serverName(data) });
      socket.destroy();
    });
    socket.on("error", () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  server.unref();
  return (server.address() as AddressInfo).port;
};
const portA = await listen("mqtt-a.example");
const portB = await listen("mqtt-b.example");

const lookup = (_host: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
  if (options.all) callback(null, [{ address: "127.0.0.1", family: 4 }]);
  else callback(null, "127.0.0.1", 4);
};
// IClientOptions has no lookup field. MQTT.js gives its options to tls.connect, which takes the lookup option of
// net.connect.
const options: IClientOptions & { lookup: typeof lookup } = {
  protocol: "mqtts",
  servers: [
    { host: "mqtt-a.example", port: portA },
    { host: "mqtt-b.example", port: portB },
  ],
  reconnectPeriod: 100,
  connectTimeout: 2000,
  lookup,
};
const client = mqtt.connect(options);
client.on("error", () => undefined);
const deadline = Date.now() + 5000;
while (!seen.some((s) => s.server === "mqtt-b.example") && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
client.end(true);

console.log(`ClientHello records: ${JSON.stringify(seen.slice(0, 2))}`);
const second = seen.find((s) => s.server === "mqtt-b.example");
if (second === undefined) throw new Error("the client did not connect to the second server");
if (second.sni !== "mqtt-b.example") {
  console.log(`BUG PRESENT: the ClientHello to mqtt-b.example has the SNI ${JSON.stringify(second.sni)}, the name of the first server.`);
  process.exit(1);
}
console.log("OK: the ClientHello to mqtt-b.example has the SNI mqtt-b.example.");
process.exit(0);
