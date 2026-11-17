// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// MQTT 5.0: the application publishes with the property subscriptionIdentifier 5. [MQTT-3.3.4-6]: a PUBLISH packet
// that a client sends to a server must not contain a Subscription Identifier. The client sends the property.
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
  client.publish("f0089/t", "id", { qos: 0, properties: { subscriptionIdentifier: 5 } }, (error) =>
    resolve(error ? `error: ${error.message}` : "no error"),
  ),
);
await new Promise((resolve) => setTimeout(resolve, 300));

const marked = publishes.filter((packet) => packet.properties?.subscriptionIdentifier !== undefined);
console.log(`publish callback: ${outcome}`);
console.log(`PUBLISH packets with a Subscription Identifier that the server got: ${marked.length}`);
client.end(true);
server.close();
if (marked.length > 0) {
  console.log("BUG PRESENT: the client sent a PUBLISH with a Subscription Identifier to the server.");
  process.exit(1);
}
console.log("OK: the client sent no PUBLISH with a Subscription Identifier.");
process.exit(0);
