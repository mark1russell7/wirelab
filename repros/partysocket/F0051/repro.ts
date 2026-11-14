// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// React Native (Hermes) has no global crypto unless a polyfill adds one. This removes it to get the same
// environment.
Reflect.deleteProperty(globalThis, "crypto");
console.log("typeof crypto:", typeof crypto);

const { default: PartySocket } = await import("partysocket");
try {
  const socket = new PartySocket({ host: "example.com", room: "room-1", startClosed: true });
  console.log("id:", socket.id);
} catch (e) {
  console.log(`new PartySocket() threw: ${(e as Error).name}: ${(e as Error).message}`);
}

// The file is a module, so top-level await works.
export {};
