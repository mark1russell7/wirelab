// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// MQTT 5.0: the server sends Topic Alias Maximum 10 in the CONNACK. The application publishes with the property
// topicAlias 0. [MQTT-3.3.2-8]: a sender must not send a PUBLISH packet with a Topic Alias of 0. The client refuses an
// alias above the maximum, but `_applyTopicAlias()` tests the alias with `if (alias)`, so it does not examine 0.
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
      const connack = { cmd: "connack", sessionPresent: false, reasonCode: 0, properties: { topicAliasMaximum: 10 } } as const;
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
  client.publish("f0084/t", "alias 0", { qos: 0, properties: { topicAlias: 0 } }, (error) =>
    resolve(error ? `error: ${error.message}` : "no error"),
  ),
);
await new Promise((resolve) => setTimeout(resolve, 300));

const zero = publishes.filter((packet) => packet.properties?.topicAlias === 0);
console.log(`publish callback: ${outcome}`);
console.log(`PUBLISH packets with Topic Alias 0 that the server got: ${zero.length}`);
client.end(true);
server.close();
if (zero.length > 0) {
  console.log("BUG PRESENT: the client sent a PUBLISH with Topic Alias 0.");
  process.exit(1);
}
console.log("OK: the client sent no PUBLISH with Topic Alias 0.");
process.exit(0);
