// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import PartySocket from "partysocket";

const socket = new PartySocket({
  host: "example.com",
  room: "room-1",
  startClosed: true,
});
const id = socket.id;
socket.updateProperties({ party: "chat" });
console.log("roomUrl after the 1st call:", socket.roomUrl);
socket.updateProperties({ room: "room-2" });
console.log("roomUrl after the 2nd call:", socket.roomUrl);
console.log("the id is the same:", socket.id === id);
