// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// MQTT 5.0: the server sends Topic Alias Maximum 2 in the CONNACK. The application publishes with topicAlias 3, which
// is out of range. For QoS 0, the publish callback gets the error "Topic Alias out of range". For QoS 1, the client
// also sends no packet, but the callback never comes. `publish()` gives `_sendPacket()` no callback for QoS 1 and
// QoS 2, so the error of `_applyTopicAlias()` goes to a no-op.
import net from "node:net";
import type { AddressInfo } from "node:net";
import mqtt from "mqtt";
import mqttPacket from "mqtt-packet";
import type { Packet } from "mqtt-packet";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

// A scripted MQTT 5.0 server: it counts the PUBLISH packets of the client.
let publishCount = 0;
const server = net.createServer((socket) => {
  const parser = mqttPacket.parser({ protocolVersion: 5 });
  parser.on("packet", (packet: Packet) => {
    if (packet.cmd === "publish") publishCount += 1;
    if (packet.cmd === "connect") {
      const connack = { cmd: "connack", sessionPresent: false, reasonCode: 0, properties: { topicAliasMaximum: 2 } } as const;
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
const settle = (qos: 0 | 1): Promise<string> =>
  Promise.race([
    new Promise<string>((resolve) =>
      client.publish(`f0090/qos${qos}`, "alias", { qos, properties: { topicAlias: 3 } }, (error) =>
        resolve(error ? `error: ${error.message}` : "no error"),
      ),
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve("no callback after 2 s"), 2000)),
  ]);
const qos0 = await settle(0);
const qos1 = await settle(1);

console.log(`Topic Alias Maximum of the server: 2, topicAlias of the publish: 3`);
console.log(`QoS 0 publish callback: ${qos0}`);
console.log(`QoS 1 publish callback: ${qos1}`);
console.log(`PUBLISH packets that the server got: ${publishCount}`);
client.end(true);
server.close();
if (qos1 === "no callback after 2 s") {
  console.log("BUG PRESENT: the client refused the QoS 1 publish for its Topic Alias, but its callback never came.");
  process.exit(1);
}
console.log("OK: the QoS 1 publish settled.");
process.exit(0);
