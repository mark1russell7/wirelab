// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// MQTT 5.0: the server refuses an UNSUBSCRIBE with the UNSUBACK reason code 0x87 (Not authorized). A reason code of
// 0x80 or more is a failure (MQTT 5.0 section 3.11.3). handleAck calls the callback of unsubscribe() with no error, and
// unsubscribeAsync() resolves. For a SUBACK with a failure code, subscribe() gives an error.
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
    if (packet.cmd === "connect") socket.write(mqttPacket.generate({ cmd: "connack", sessionPresent: false, reasonCode: 0 }, opts));
    if (packet.cmd === "subscribe") {
      socket.write(mqttPacket.generate({ cmd: "suback", messageId: packet.messageId, granted: packet.subscriptions.map(() => 0x87) }, opts));
    }
    if (packet.cmd === "unsubscribe") {
      socket.write(mqttPacket.generate({ cmd: "unsuback", messageId: packet.messageId, granted: packet.unsubscriptions.map(() => 0x87) }, opts));
    }
  });
  socket.on("data", (data) => parser.parse(data));
  socket.on("error", () => undefined);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, { protocolVersion: 5, reconnectPeriod: 0 });
client.on("error", () => undefined);
await new Promise<void>((resolve) => client.once("connect", () => resolve()));
const subscribed = await new Promise<string>((resolve) => client.subscribe("f0121/t", (error) => resolve(error?.message ?? "no error")));
const unsubscribed = await new Promise<string>((resolve) =>
  client.unsubscribe("f0121/t", (error, packet) =>
    // mqtt-packet puts the reason codes of an UNSUBACK in `granted`.
    resolve(`${error?.message ?? "no error"}; reason codes ${JSON.stringify(packet?.cmd === "unsuback" ? packet.granted : undefined)}`),
  ),
);
let asyncResult: string;
try {
  await client.unsubscribeAsync("f0121/t");
  asyncResult = "resolved";
} catch (error) {
  asyncResult = `rejected: ${(error as Error).message}`;
}
client.end(true);
server.close();

console.log(`subscribe() with SUBACK 0x87: ${subscribed}`);
console.log(`unsubscribe() with UNSUBACK 0x87: ${unsubscribed}`);
console.log(`unsubscribeAsync() with UNSUBACK 0x87: ${asyncResult}`);
if (unsubscribed.startsWith("no error") || asyncResult === "resolved") {
  console.log("BUG PRESENT: unsubscribe() reported success for an UNSUBACK with the failure reason code 0x87.");
  process.exit(1);
}
console.log("OK: unsubscribe() reported the failure reason code 0x87.");
process.exit(0);
