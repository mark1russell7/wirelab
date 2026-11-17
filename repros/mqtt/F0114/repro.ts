// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// MQTT 5.0: the server sends a QoS 2 PUBLISH with the topic "f0114/t" and Topic Alias 1, then a QoS 2 PUBLISH with an
// empty topic and Topic Alias 1. [MQTT-3.3.2-12]: the receiver uses the topic of the alias. handlePublish puts the
// topic of the alias in a local variable, but it stores the packet, and the PUBREL handler emits 'message' with the
// topic of the stored packet.
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
const server = net.createServer((socket) => {
  const parser = mqttPacket.parser(opts);
  parser.on("packet", (packet: Packet) => {
    if (packet.cmd === "connect") {
      socket.write(mqttPacket.generate({ cmd: "connack", sessionPresent: false, reasonCode: 0 }, opts));
      const publish = (messageId: number, topic: string, payload: string) =>
        mqttPacket.generate({ cmd: "publish", topic, payload, qos: 2, retain: false, dup: false, messageId, properties: { topicAlias: 1 } }, opts);
      socket.write(Buffer.concat([publish(1, "f0114/t", "first"), publish(2, "", "second")]));
    }
    if (packet.cmd === "pubrec") socket.write(mqttPacket.generate({ cmd: "pubrel", messageId: packet.messageId }, opts));
  });
  socket.on("data", (data) => parser.parse(data));
  socket.on("error", () => undefined);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

const messages: string[] = [];
const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, { protocolVersion: 5, reconnectPeriod: 0, properties: { topicAliasMaximum: 10 } });
client.on("message", (topic, payload) => messages.push(`${JSON.stringify(topic)} ${payload.toString()}`));
await new Promise<void>((resolve) => client.once("connect", () => resolve()));
await new Promise((resolve) => setTimeout(resolve, 500));
client.end(true);
server.close();

console.log(`messages: ${JSON.stringify(messages)}`);
const second = messages.find((message) => message.endsWith(" second"));
if (second === undefined) throw new Error("the second message did not arrive");
if (!second.startsWith('"f0114/t"')) {
  console.log(`BUG PRESENT: the QoS 2 message with Topic Alias 1 and an empty topic arrived with the topic ${second.split(" ")[0]}, not "f0114/t".`);
  process.exit(1);
}
console.log('OK: the QoS 2 message with Topic Alias 1 arrived with the topic "f0114/t".');
process.exit(0);
