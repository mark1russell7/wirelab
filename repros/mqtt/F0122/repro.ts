// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// With manualConnect: true, the client has no stream until connect(). An app that calls end() before connect(), for
// example at a shutdown, gets a TypeError.
import mqtt from "mqtt";

setTimeout(() => {
  console.log("time limit");
  process.exit(2);
}, 20000).unref();

// The client does not connect, so no server is necessary.
const client = mqtt.connect("mqtt://127.0.0.1:1", { manualConnect: true, reconnectPeriod: 0 });
let result: string;
try {
  await new Promise<void>((resolve) => {
    client.end(() => resolve());
    setTimeout(resolve, 1000);
  });
  result = "no throw";
} catch (error) {
  result = `threw ${(error as Error).name}: ${(error as Error).message}`;
}

console.log(`end() before connect(): ${result}`);
if (result.includes("TypeError")) {
  console.log("BUG PRESENT: end() before connect() of a client with manualConnect threw a TypeError.");
  process.exit(1);
}
console.log("OK: end() before connect() of a client with manualConnect threw no TypeError.");
process.exit(0);
