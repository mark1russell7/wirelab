// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// MQTT 5.0 with a session that stays (clean: false, Session Expiry Interval 300). The client sends a QoS 1 PUBLISH,
// and the network connection closes before the PUBACK. The client connects again, the server answers with Session
// Present 1, and the client sends the PUBLISH again. [MQTT-3.3.1-1]: the client must set the DUP flag to 1 when it
// sends a PUBLISH again. MQTT 3.1.1 has the same rule, and the client does the same there.
import net from "node:net";
import type { AddressInfo } from "node:net";
import mqtt from "mqtt";
import mqttPacket from "mqtt-packet";
import type { IPublishPacket, Packet } from "mqtt-packet";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

// A scripted MQTT 5.0 server. It sends no PUBACK. On the first connection, it closes the socket after the first
// PUBLISH. On the second connection, it answers with Session Present 1.
const publishes: Array<{ connection: number; packet: IPublishPacket }> = [];
let connections = 0;
const server = net.createServer((socket) => {
  connections += 1;
  const connection = connections;
  const parser = mqttPacket.parser({ protocolVersion: 5 });
  parser.on("packet", (packet: Packet) => {
    if (packet.cmd === "connect") {
      const connack = { cmd: "connack", sessionPresent: connection > 1, reasonCode: 0 } as const;
      socket.write(mqttPacket.generate(connack, { protocolVersion: 5 }));
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
  clientId: "f0085",
  clean: false,
  properties: { sessionExpiryInterval: 300 },
  reconnectPeriod: 200,
});
await new Promise<void>((resolve) => client.once("connect", () => resolve()));
client.publish("f0085/t", "once", { qos: 1 }, () => undefined);
while (!publishes.some((p) => p.connection === 2)) await new Promise((resolve) => setTimeout(resolve, 50));

for (const { connection, packet } of publishes) {
  console.log(`connection ${connection}: PUBLISH id ${packet.messageId}, QoS ${packet.qos}, DUP ${packet.dup ? 1 : 0}`);
}
const again = publishes.filter((p) => p.connection === 2);
client.end(true);
server.close();
if (again.some((p) => !p.packet.dup)) {
  console.log("BUG PRESENT: the client sent the unacknowledged PUBLISH again with DUP 0.");
  process.exit(1);
}
console.log("OK: the client sent the PUBLISH again with DUP 1.");
process.exit(0);
