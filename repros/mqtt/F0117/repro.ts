// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// With reconnectPeriod 0, the client ends with end(). Then publish() with QoS 1 throws a TypeError, and
// publishAsync() rejects with the same TypeError. The callback of publish() does not get an error that tells that the
// client is closed.
import net from "node:net";
import type { AddressInfo } from "node:net";
import mqtt from "mqtt";
import mqttPacket from "mqtt-packet";
import type { Packet } from "mqtt-packet";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

const server = net.createServer((socket) => {
  const parser = mqttPacket.parser({ protocolVersion: 4 });
  parser.on("packet", (packet: Packet) => {
    if (packet.cmd === "connect") socket.write(mqttPacket.generate({ cmd: "connack", returnCode: 0, sessionPresent: false }));
  });
  socket.on("data", (data) => parser.parse(data));
  socket.on("error", () => undefined);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, { reconnectPeriod: 0 });
await new Promise<void>((resolve) => client.once("connect", () => resolve()));
await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));

const results: string[] = [];
try {
  client.publish("f0117/t", "after end", { qos: 1 }, (error) => results.push(`publish callback: ${error?.message ?? "no error"}`));
  results.push("publish: no throw");
} catch (error) {
  results.push(`publish threw ${(error as Error).name}: ${(error as Error).message}`);
}
try {
  await client.publishAsync("f0117/t", "after end", { qos: 1 });
  results.push("publishAsync: resolved");
} catch (error) {
  results.push(`publishAsync rejected with ${(error as Error).name}: ${(error as Error).message}`);
}
await new Promise((resolve) => setTimeout(resolve, 300));
server.close();

for (const result of results) console.log(result);
if (results.some((result) => result.includes("TypeError"))) {
  console.log("BUG PRESENT: publish() with QoS 1 after end() gave a TypeError, not an error that tells that the client is closed.");
  process.exit(1);
}
console.log("OK: publish() with QoS 1 after end() gave no TypeError.");
process.exit(0);
