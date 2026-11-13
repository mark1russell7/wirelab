// F0061: a URL with no scheme in Node.js (no global location object, as in React Native).
// The code of url() has a fallback to "https://" for this case.
import { io } from "socket.io-client";
import { versions } from "./lib/server.mjs";

console.log(`${await versions("socket.io-client")}, typeof location: ${typeof location}`);
const socket = io("127.0.0.1:9", { autoConnect: false });
console.log(`io("127.0.0.1:9"): the uri of the Manager is "${socket.io.uri}"`);
const fault = !socket.io.uri.startsWith("https://");
console.log(fault ? 'FAULT: the uri does not start with "https://"' : 'OK: the uri starts with "https://"');
process.exit(fault ? 1 : 0);
