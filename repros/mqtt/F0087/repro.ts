// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// MQTT 5.0: the server holds the PUBACK of one QoS 1 PUBLISH, so its Packet Identifier stays in use. The client then
// completes 65534 other QoS 1 exchanges and publishes one more message. [MQTT-2.2.1-3]: each new PUBLISH must have a
// Packet Identifier that is not in use. The default message id provider counts up and wraps after 65535 identifiers.
// It does not skip an identifier that is in use.
import net from "node:net";
import type { AddressInfo } from "node:net";
import mqtt from "mqtt";
import mqttPacket from "mqtt-packet";
import type { IPublishPacket, Packet } from "mqtt-packet";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

// A scripted MQTT 5.0 server: it sends a PUBACK for each PUBLISH, but not for the topic f0087/hold.
const publishes: IPublishPacket[] = [];
const server = net.createServer((socket) => {
  const parser = mqttPacket.parser({ protocolVersion: 5 });
  parser.on("packet", (packet: Packet) => {
    if (packet.cmd === "connect") {
      socket.write(mqttPacket.generate({ cmd: "connack", sessionPresent: false, reasonCode: 0 }, { protocolVersion: 5 }));
    }
    if (packet.cmd === "publish") {
      if (packet.topic !== "f0087/ok") publishes.push(packet);
      if (packet.topic !== "f0087/hold") {
        socket.write(mqttPacket.generate({ cmd: "puback", messageId: packet.messageId, reasonCode: 0 }, { protocolVersion: 5 }));
      }
    }
  });
  socket.on("data", (data) => parser.parse(data));
  socket.on("error", () => undefined);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, { protocolVersion: 5, reconnectPeriod: 0 });
await new Promise<void>((resolve) => client.once("connect", () => resolve()));
client.publish("f0087/hold", "held", { qos: 1 }, () => undefined);
const others = 65534;
await new Promise<void>((resolve) => {
  let done = 0;
  for (let index = 0; index < others; index += 1) {
    client.publish("f0087/ok", "x", { qos: 1 }, () => {
      done += 1;
      if (done === others) resolve();
    });
  }
});
client.publish("f0087/new", "new", { qos: 1 }, () => undefined);
await new Promise((resolve) => setTimeout(resolve, 300));

const held = publishes.find((p) => p.topic === "f0087/hold");
const fresh = publishes.find((p) => p.topic === "f0087/new");
console.log(`completed QoS 1 exchanges: ${others}`);
console.log(`Packet Identifier of the held PUBLISH (no PUBACK): ${held?.messageId}`);
console.log(`Packet Identifier of the new PUBLISH: ${fresh?.messageId}`);
client.end(true);
server.close();
if (held !== undefined && fresh !== undefined && held.messageId === fresh.messageId) {
  console.log("BUG PRESENT: the client gave the new PUBLISH a Packet Identifier that is in use.");
  process.exit(1);
}
console.log("OK: the new PUBLISH has a Packet Identifier that is not in use.");
process.exit(0);
