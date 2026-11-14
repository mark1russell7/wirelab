// npm install, then: npx tsc -p tsconfig.repro.json
import { Socket } from "engine.io-client";

// The JSDoc of the option perMessageDeflate says "Set to false to disable."
const socket = new Socket("http://localhost:3000", { perMessageDeflate: false });

// At run time, the callback can be the second argument.
socket.send("hello", () => console.log("flushed"));
