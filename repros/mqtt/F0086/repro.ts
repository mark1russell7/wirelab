// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// MQTT 5.0 with clean: false and Session Expiry Interval 300. The client sends a QoS 1 PUBLISH, and the network
// connection closes before the PUBACK. The client connects again, and the server answers with Session Present 0: it
// has no session for the client. [MQTT-3.2.2-5]: a client with Session State that gets Session Present 0 must discard
// its Session State. So the client must not send the old PUBLISH again as a retransmission of the lost session.
import net from "node:net";
import type { AddressInfo } from "node:net";
import mqtt from "mqtt";
import mqttPacket from "mqtt-packet";
import type { IPublishPacket, Packet } from "mqtt-packet";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

// A scripted MQTT 5.0 server. It sends no PUBACK, it closes the first socket after the first PUBLISH, and it always
// answers with Session Present 0.
const publishes: Array<{ connection: number; packet: IPublishPacket }> = [];
let connections = 0;
let connacks = 0;
const server = net.createServer((socket) => {
  connections += 1;
  const connection = connections;
  const parser = mqttPacket.parser({ protocolVersion: 5 });
  parser.on("packet", (packet: Packet) => {
    if (packet.cmd === "connect") {
      connacks += 1;
      socket.write(mqttPacket.generate({ cmd: "connack", sessionPresent: false, reasonCode: 0 }, { protocolVersion: 5 }));
    }
    if (packet.cmd === "publish") {
      publishes.push({ connection, packet });
      if (connection === 1) setTimeout(() => socket.destroy(), 100);
    }
  });
  socket.on("data", (data) => parser.parse(data));
  socket.on("error", () => undefined);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
  protocolVersion: 5,
  clientId: "f0086",
  clean: false,
  properties: { sessionExpiryInterval: 300 },
  reconnectPeriod: 200,
});
await new Promise<void>((resolve) => client.once("connect", () => resolve()));
client.publish("f0086/t", "once", { qos: 1 }, () => undefined);
while (connacks < 2) await new Promise((resolve) => setTimeout(resolve, 50));
await new Promise((resolve) => setTimeout(resolve, 500));

for (const { connection, packet } of publishes) {
  console.log(`connection ${connection}: PUBLISH id ${packet.messageId}, DUP ${packet.dup ? 1 : 0}`);
}
console.log("the CONNACK of connection 2 has Session Present 0");
const again = publishes.filter((p) => p.connection === 2);
client.end(true);
server.close();
if (again.length > 0) {
  console.log("BUG PRESENT: after Session Present 0, the client sent the PUBLISH of the lost session again.");
  process.exit(1);
}
console.log("OK: after Session Present 0, the client discarded the PUBLISH of the lost session.");
process.exit(0);
