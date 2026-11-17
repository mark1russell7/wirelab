// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// The application publishes a QoS 0 message with the option dup: true. [MQTT-3.3.1-2]: the DUP flag must be 0 for
// each QoS 0 message. The client copies the option of the application into the packet.
import net from "node:net";
import type { AddressInfo } from "node:net";
import mqtt from "mqtt";
import mqttPacket from "mqtt-packet";
import type { IPublishPacket, Packet } from "mqtt-packet";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

// A scripted MQTT 5.0 server: it records each PUBLISH that the client sends.
const publishes: IPublishPacket[] = [];
const server = net.createServer((socket) => {
  const parser = mqttPacket.parser({ protocolVersion: 5 });
  parser.on("packet", (packet: Packet) => {
    if (packet.cmd === "publish") publishes.push(packet);
    if (packet.cmd === "connect") {
      socket.write(mqttPacket.generate({ cmd: "connack", sessionPresent: false, reasonCode: 0 }, { protocolVersion: 5 }));
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
  client.publish("f0088/t", "dup", { qos: 0, dup: true }, (error) => resolve(error ? `error: ${error.message}` : "no error")),
);
await new Promise((resolve) => setTimeout(resolve, 300));

const flagged = publishes.filter((packet) => packet.qos === 0 && packet.dup);
console.log(`publish callback: ${outcome}`);
console.log(`QoS 0 PUBLISH packets with DUP 1 that the server got: ${flagged.length}`);
client.end(true);
server.close();
if (flagged.length > 0) {
  console.log("BUG PRESENT: the client sent a QoS 0 PUBLISH with DUP 1.");
  process.exit(1);
}
console.log("OK: the client sent no QoS 0 PUBLISH with DUP 1.");
process.exit(0);
