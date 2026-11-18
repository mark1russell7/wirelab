// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// A string literal of a .proto file can hold the escapes \uXXXX and \UXXXXXXXX (the protobuf language specification,
// and protoc). The tokenizer of protobufjs removes the "\u" or "\U" and keeps the hex digits as text.
import protobuf from "protobufjs";

const source = String.raw`syntax = "proto2"; message M { optional string s = 1 [default = "caf\u00e9 \U0001F600"]; }`;
const M = protobuf.parse(source).root.lookupType("M");
const value = (M.decode(new Uint8Array(0)) as unknown as { s: string }).s;
const expected = "caf\u00e9 \u{1F600}";
console.log(`.proto: ${source}`);
console.log(`default of s: ${JSON.stringify(value)}, expected ${JSON.stringify(expected)}`);

if (value !== expected) {
  console.log("BUG PRESENT: the parser removes the escapes \\u and \\U of a string literal and keeps the hex digits.");
  process.exit(1);
}
console.log("OK: the parser reads the escapes \\u and \\U of a string literal.");
process.exit(0);
