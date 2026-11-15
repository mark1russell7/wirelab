// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
import { io } from "socket.io-client";

// Node.js has no global location object, as React Native.
console.log(`"location" in globalThis: ${"location" in globalThis}`);

const socket = io("example.com:3000", { autoConnect: false });
console.log(`io("example.com:3000"): the URI of the Manager is "${Reflect.get(socket.io, "uri")}"`); // the field uri is private
