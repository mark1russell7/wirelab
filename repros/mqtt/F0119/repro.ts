// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// MQTT 5.0: the server sends Retain Available 0 in the CONNACK. [MQTT-3.2.2-14]: the client must not send a PUBLISH
// with RETAIN 1. The client sends a PUBLISH with RETAIN 1. No file of MQTT.js reads retainAvailable.
import net from "node:net";
import type { AddressInfo } from "node:net";
import mqtt from "mqtt";
import mqttPacket from "mqtt-packet";
import type { Packet } from "mqtt-packet";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

const opts = { protocolVersion: 5 } as const;
const publishes: boolean[] = [];
const server = net.createServer((socket) => {
  const parser = mqttPacket.parser(opts);
  parser.on("packet", (packet: Packet) => {
    if (packet.cmd === "connect") {
      socket.write(mqttPacket.generate({ cmd: "connack", sessionPresent: false, reasonCode: 0, properties: { retainAvailable: false } }, opts));
    }
    if (packet.cmd === "publish") publishes.push(packet.retain);
  });
  socket.on("data", (data) => parser.parse(data));
  socket.on("error", () => undefined);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, { protocolVersion: 5, reconnectPeriod: 0 });
client.on("error", () => undefined);
await new Promise<void>((resolve) => client.once("connect", () => resolve()));
const result = await new Promise<string>((resolve) => {
  client.publish("f0119/t", "retained", { qos: 0, retain: true }, (error) => resolve(error?.message ?? "no error"));
  setTimeout(() => resolve("no callback"), 1000);
});
await new Promise((resolve) => setTimeout(resolve, 200));
client.end(true);
server.close();

console.log("Retain Available of the server: 0");
console.log(`publish() with retain true: callback ${result}`);
console.log(`RETAIN of the PUBLISH packets that the server got: ${JSON.stringify(publishes)}`);
if (publishes.includes(true)) {
  console.log("BUG PRESENT: the client sent a PUBLISH with RETAIN 1 to a server with Retain Available 0.");
  process.exit(1);
}
console.log("OK: the client sent no PUBLISH with RETAIN 1.");
process.exit(0);
