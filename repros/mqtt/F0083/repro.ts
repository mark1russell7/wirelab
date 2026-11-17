// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// MQTT 5.0: the server sends Maximum Packet Size 128 in the CONNACK. The application publishes a QoS 0 message with a
// payload of 300 bytes. [MQTT-3.2.2-15]: the client must not send packets larger than the Maximum Packet Size to the
// server.
import net from "node:net";
import type { AddressInfo } from "node:net";
import mqtt from "mqtt";
import mqttPacket from "mqtt-packet";
import type { Packet } from "mqtt-packet";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

const maximumPacketSize = 128;
// The size of a packet on the wire: one byte of type and flags, the Remaining Length as a variable byte integer, and
// the bytes that it counts.
const wireSize = (remaining: number): number => 1 + (remaining < 128 ? 1 : remaining < 16384 ? 2 : remaining < 2097152 ? 3 : 4) + remaining;

// A scripted MQTT 5.0 server: it records the size of each PUBLISH that the client sends.
const publishSizes: number[] = [];
const server = net.createServer((socket) => {
  const parser = mqttPacket.parser({ protocolVersion: 5 });
  parser.on("packet", (packet: Packet) => {
    if (packet.cmd === "publish") publishSizes.push(wireSize(packet.length ?? 0));
    if (packet.cmd === "connect") {
      const connack = { cmd: "connack", sessionPresent: false, reasonCode: 0, properties: { maximumPacketSize } } as const;
      socket.write(mqttPacket.generate(connack, { protocolVersion: 5 }));
    }
  });
  socket.on("data", (data) => parser.parse(data));
  socket.on("error", () => undefined);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, { protocolVersion: 5, reconnectPeriod: 0 });
await new Promise<void>((resolve) => client.once("connect", () => resolve()));
const outcome = await new Promise<string>((resolve) =>
  client.publish("f0083/t", Buffer.alloc(300, 0x61), { qos: 0 }, (error) => resolve(error ? `error: ${error.message}` : "no error")),
);
await new Promise((resolve) => setTimeout(resolve, 300));

console.log(`Maximum Packet Size of the server: ${maximumPacketSize} bytes`);
console.log(`publish callback: ${outcome}`);
console.log(`PUBLISH packets that the server got, in bytes: ${JSON.stringify(publishSizes)}`);
client.end(true);
server.close();
if (publishSizes.some((size) => size > maximumPacketSize)) {
  console.log("BUG PRESENT: the client sent a PUBLISH larger than the Maximum Packet Size of the server.");
  process.exit(1);
}
console.log("OK: the client sent no packet larger than the Maximum Packet Size of the server.");
process.exit(0);
