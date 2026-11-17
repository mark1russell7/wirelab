// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// MQTT 5.0: the server sends Receive Maximum 2 in the CONNACK and holds its PUBACK packets. The client sends 5 QoS 1
// PUBLISH packets at once. [MQTT-3.3.4-7]: the client must not send more QoS 1 and QoS 2 PUBLISH packets for which it
// has no PUBACK than the Receive Maximum.
import net from "node:net";
import type { AddressInfo } from "node:net";
import mqtt from "mqtt";
import mqttPacket from "mqtt-packet";
import type { Packet } from "mqtt-packet";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

const receiveMaximum = 2;
// A scripted MQTT 5.0 server: it records each packet of the client and sends no PUBACK.
const received: Packet[] = [];
const server = net.createServer((socket) => {
  const parser = mqttPacket.parser({ protocolVersion: 5 });
  parser.on("packet", (packet: Packet) => {
    received.push(packet);
    if (packet.cmd === "connect") {
      const connack = { cmd: "connack", sessionPresent: false, reasonCode: 0, properties: { receiveMaximum } } as const;
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
for (let index = 0; index < 5; index += 1) client.publish("f0082/t", `message ${index}`, { qos: 1 }, () => undefined);
await new Promise((resolve) => setTimeout(resolve, 500));

const inFlight = received.filter((packet) => packet.cmd === "publish").length;
console.log(`Receive Maximum of the server: ${receiveMaximum}`);
console.log(`QoS 1 PUBLISH packets sent with no PUBACK: ${inFlight}`);
client.end(true);
server.close();
if (inFlight > receiveMaximum) {
  console.log("BUG PRESENT: the client sent more QoS 1 PUBLISH packets in flight than the Receive Maximum of the server.");
  process.exit(1);
}
console.log("OK: the client kept to the Receive Maximum of the server.");
process.exit(0);
