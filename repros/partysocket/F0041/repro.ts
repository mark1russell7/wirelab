// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import PartySocket from "partysocket";

const socket = new PartySocket({
  host: "example.com",
  room: "room-1",
  path: "sub/path",
  startClosed: true,
});
try {
  socket.updateProperties({ room: "room-2" });
  console.log("updateProperties(): ok");
} catch (e) {
  console.log("updateProperties() threw:", (e as Error).message);
}
console.log("roomUrl:", socket.roomUrl);
