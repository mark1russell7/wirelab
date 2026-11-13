import { Socket } from "engine.io-client";

// "Set to false to disable." (JSDoc of the perMessageDeflate option)
const socket = new Socket("http://localhost:3000", { perMessageDeflate: false });

// the callback as second argument (accepted at runtime)
socket.send("hello", () => console.log("flushed"));
