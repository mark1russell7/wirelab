// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// The protobuf language specification allows "0x" and "0X" as the prefix of a hex number, and protoc accepts both.
// The .proto parser of protobufjs accepts only "0x", so a file that protoc accepts does not parse.
import protobuf from "protobufjs";

const source = `syntax = "proto2"; message M { optional int32 x = 0X1F [default = 0X7F]; }`;
console.log(`.proto: ${source}`);
let result: string;
try {
  const field = protobuf.parse(source).root.lookupType("M").fields.x!.resolve();
  result = `id ${field.id}, default ${String(field.defaultValue)}`;
} catch (error) {
  result = `parse threw ${(error as Error).name}: ${(error as Error).message}`;
}
console.log(`${result} (expected id 31, default 127)`);

if (result !== "id 31, default 127") {
  console.log("BUG PRESENT: the parser does not accept a hex number with the prefix 0X.");
  process.exit(1);
}
console.log("OK: the parser accepts a hex number with the prefix 0X.");
process.exit(0);
