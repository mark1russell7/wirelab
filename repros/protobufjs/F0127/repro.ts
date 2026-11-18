// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// The default of a bytes field is a string literal (protoc). Field#resolve of protobufjs decodes the text as base64
// when the text looks like base64. So [default = "test"] gives the bytes b5 eb 2d, not "test" (74 65 73 74).
import protobuf from "protobufjs";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

const source = `syntax = "proto2"; message M { optional bytes b = 1 [default = "test"]; optional bytes c = 2 [default = "tes"]; }`;
const M = protobuf.parse(source).root.lookupType("M");
const message = M.decode(new Uint8Array(0)) as unknown as { b: Uint8Array; c: Uint8Array };
console.log(`.proto: ${source}`);
console.log(`default of b ("test"): ${hex(message.b)}, expected 74657374`);
console.log(`default of c ("tes"):  ${hex(message.c)}, expected 746573`);

if (hex(message.b) !== "74657374" || hex(message.c) !== "746573") {
  console.log("BUG PRESENT: a bytes default that looks like base64 is decoded as base64.");
  process.exit(1);
}
console.log("OK: a bytes default is the bytes of its string literal.");
process.exit(0);
