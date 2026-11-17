// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// MQTT 5.0: the server sends Maximum QoS 1 in the CONNACK. [MQTT-3.2.2-11]: the client must not send a PUBLISH with a
// QoS above the Maximum QoS of the server. The client sends a QoS 2 PUBLISH. No file of MQTT.js reads maximumQoS.
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
const publishes: number[] = [];
const server = net.createServer((socket) => {
  const parser = mqttPacket.parser(opts);
  parser.on("packet", (packet: Packet) => {
    if (packet.cmd === "connect") {
      socket.write(mqttPacket.generate({ cmd: "connack", sessionPresent: false, reasonCode: 0, properties: { maximumQoS: 1 } }, opts));
    }
    if (packet.cmd === "publish") {
      publishes.push(packet.qos);
      if (packet.qos === 2) socket.write(mqttPacket.generate({ cmd: "pubrec", messageId: packet.messageId }, opts));
    }
    if (packet.cmd === "pubrel") socket.write(mqttPacket.generate({ cmd: "pubcomp", messageId: packet.messageId }, opts));
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
  client.publish("f0118/t", "qos 2", { qos: 2 }, (error) => resolve(error?.message ?? "no error"));
  setTimeout(() => resolve("no callback"), 1000);
});
await new Promise((resolve) => setTimeout(resolve, 200));
client.end(true);
server.close();

console.log("Maximum QoS of the server: 1");
console.log(`publish() with QoS 2: callback ${result}`);
console.log(`QoS of the PUBLISH packets that the server got: ${JSON.stringify(publishes)}`);
if (publishes.some((qos) => qos > 1)) {
  console.log("BUG PRESENT: the client sent a QoS 2 PUBLISH to a server with Maximum QoS 1.");
  process.exit(1);
}
console.log("OK: the client sent no PUBLISH above the Maximum QoS of the server.");
process.exit(0);
