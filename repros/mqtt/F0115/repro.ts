// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// One subscribe() call with 2 topics. The SUBACK grants "f0115/a" and refuses "f0115/b" (0x80). Then the server closes
// the connection. After the reconnect, the client must subscribe again to "f0115/a": the server granted it, and the
// session is new. handleAck removes each topic of the SUBSCRIBE from _resubscribeTopics when one reason code is a
// failure, so the client does not subscribe again to "f0115/a".
import net from "node:net";
import type { AddressInfo } from "node:net";
import mqtt from "mqtt";
import mqttPacket from "mqtt-packet";
import type { Packet } from "mqtt-packet";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

const subscribes: string[][] = [];
let connections = 0;
const server = net.createServer((socket) => {
  connections += 1;
  const parser = mqttPacket.parser({ protocolVersion: 4 });
  parser.on("packet", (packet: Packet) => {
    if (packet.cmd === "connect") socket.write(mqttPacket.generate({ cmd: "connack", returnCode: 0, sessionPresent: false }));
    if (packet.cmd === "subscribe") {
      subscribes.push(packet.subscriptions.map((s) => s.topic));
      const granted = packet.subscriptions.map((s) => (s.topic === "f0115/b" ? 0x80 : 0));
      socket.write(mqttPacket.generate({ cmd: "suback", messageId: packet.messageId, granted }));
      if (connections === 1) setTimeout(() => socket.destroy(), 100);
    }
  });
  socket.on("data", (data) => parser.parse(data));
  socket.on("error", () => undefined);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, { reconnectPeriod: 100 });
client.on("error", () => undefined);
await new Promise<void>((resolve) => client.once("connect", () => resolve()));
const result = await new Promise<string>((resolve) => {
  client.subscribe(["f0115/a", "f0115/b"], { qos: 0 }, (error, granted) =>
    resolve(`${error?.message ?? "no error"}; granted ${JSON.stringify(granted?.map((g) => [g.topic, g.qos]))}`),
  );
});
await new Promise<void>((resolve) => client.once("connect", () => resolve()));
await new Promise((resolve) => setTimeout(resolve, 500));
client.end(true);
server.close();

console.log(`subscribe() callback: ${result}`);
console.log(`SUBSCRIBE packets: ${JSON.stringify(subscribes)}`);
const again = subscribes.slice(1).some((topics) => topics.includes("f0115/a"));
if (!again) {
  console.log('BUG PRESENT: after the reconnect, the client did not subscribe again to "f0115/a", which the SUBACK granted.');
  process.exit(1);
}
console.log('OK: after the reconnect, the client subscribed again to "f0115/a".');
process.exit(0);
