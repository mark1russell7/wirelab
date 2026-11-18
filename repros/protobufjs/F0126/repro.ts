// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// An octal or hex escape in a .proto string literal stands for one byte (protoc). protobufjs makes one char of each
// byte. So a string default with escaped UTF-8 bytes gets the wrong text, and a bytes default gets more bytes.
import protobuf from "protobufjs";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

const source = String.raw`syntax = "proto2"; message M { optional string s = 1 [default = "caf\303\251"]; optional bytes b = 2 [default = "\377\x80"]; }`;
const M = protobuf.parse(source).root.lookupType("M");
const message = M.decode(new Uint8Array(0)) as unknown as { s: string; b: Uint8Array };
console.log(`.proto: ${source}`);
// protoc: s is the UTF-8 text of the bytes 63 61 66 c3 a9, and b is the bytes ff 80.
console.log(`default of s: ${JSON.stringify(message.s)}, expected ${JSON.stringify("caf\u00e9")}`);
console.log(`default of b: ${hex(message.b)}, expected ff80`);

if (message.s !== "caf\u00e9" || hex(message.b) !== "ff80") {
  console.log("BUG PRESENT: an octal or hex escape of a byte above 0x7f gives a char, not a byte.");
  process.exit(1);
}
console.log("OK: an octal or hex escape gives one byte.");
process.exit(0);
