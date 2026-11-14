// npm install, then: npx tsc -p tsconfig.repro.json
import { WebSocket } from "partysocket";
import { usePartySocket } from "partysocket/react";

export function useRoom() {
  // onError gets the ErrorEvent of partysocket (with message and error).
  usePartySocket({
    host: "example.com",
    room: "room-1",
    onError: (event) => console.log(event.message),
  });

  // The same handler on addEventListener() compiles.
  const ws = new WebSocket("wss://example.com/");
  ws.addEventListener("error", (event) => console.log(event.message));
}
