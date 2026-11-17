// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// The server closes the connection. While the client is offline, the app calls subscribe(). The first reconnect
// attempt fails, and its stream close calls _flushVolatile: the callback of subscribe() gets "Connection closed". So
// the app thinks that it has no subscription. But _flushVolatile keeps the queued SUBSCRIBE and the topic in
// _resubscribeTopics, so the next connection sends the SUBSCRIBE, and the server makes the subscription.
import net from "node:net";
import type { AddressInfo } from "node:net";
import mqtt from "mqtt";
import mqttPacket from "mqtt-packet";
import type { Packet } from "mqtt-packet";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

const subscribes: Array<{ connection: number; topics: string[] }> = [];
let connections = 0;
const server = net.createServer((socket) => {
  connections += 1;
  const connection = connections;
  socket.on("error", () => undefined);
  // Connection 2 is the failed reconnect attempt: the server closes it before the CONNACK.
  if (connection === 2) {
    socket.destroy();
    return;
  }
  const parser = mqttPacket.parser({ protocolVersion: 4 });
  parser.on("packet", (packet: Packet) => {
    if (packet.cmd === "connect") {
      socket.write(mqttPacket.generate({ cmd: "connack", returnCode: 0, sessionPresent: false }));
      if (connection === 1) setTimeout(() => socket.destroy(), 100);
    }
    if (packet.cmd === "subscribe") {
      subscribes.push({ connection, topics: packet.subscriptions.map((s) => s.topic) });
      socket.write(mqttPacket.generate({ cmd: "suback", messageId: packet.messageId, granted: packet.subscriptions.map(() => 0) }));
    }
  });
  socket.on("data", (data) => parser.parse(data));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, { reconnectPeriod: 300 });
client.on("error", () => undefined);
await new Promise<void>((resolve) => client.once("connect", () => resolve()));
await new Promise<void>((resolve) => client.once("offline", () => resolve()));
const result = await new Promise<string>((resolve) => {
  client.subscribe("f0120/t", { qos: 0 }, (error) => resolve(error?.message ?? "no error"));
  setTimeout(() => resolve("no callback"), 5000);
});
const deadline = Date.now() + 5000;
while (connections < 3 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
await new Promise((resolve) => setTimeout(resolve, 500));
client.end(true);
server.close();

console.log(`connections: ${connections}`);
console.log(`subscribe() while offline: callback ${result}`);
console.log(`SUBSCRIBE packets: ${JSON.stringify(subscribes)}`);
const sent = subscribes.some((s) => s.topics.includes("f0120/t"));
if (result !== "no error" && result !== "no callback" && sent) {
  console.log('BUG PRESENT: the callback of subscribe() got an error, but the server got the SUBSCRIBE for "f0120/t".');
  process.exit(1);
}
console.log("OK: the callback of subscribe() agrees with the SUBSCRIBE packets.");
process.exit(0);
