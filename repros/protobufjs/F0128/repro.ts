// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// protoc keeps a 64-bit default exactly. The .proto parser of protobufjs reads each number as a float, so a default
// that is larger than 2^53 loses its low bits.
import protobuf from "protobufjs";

const source = `syntax = "proto2"; message M { optional int64 a = 1 [default = 9007199254740993]; optional fixed64 b = 2 [default = 0x8000000000000001]; optional sint64 c = 3 [default = -9223372036854775807]; }`;
const M = protobuf.parse(source).root.lookupType("M");
const defaults = M.toObject(M.decode(new Uint8Array(0)), { defaults: true, longs: String }) as Record<string, string>;
const expected: Record<string, string> = { a: "9007199254740993", b: "9223372036854775809", c: "-9223372036854775807" };
console.log(`.proto: ${source}`);
let wrong = false;
for (const name of ["a", "b", "c"]) {
  console.log(`default of ${name}: ${defaults[name]}, expected ${expected[name]}`);
  if (defaults[name] !== expected[name]) wrong = true;
}

if (wrong) {
  console.log("BUG PRESENT: a 64-bit default larger than 2^53 loses its low bits.");
  process.exit(1);
}
console.log("OK: the parser keeps each 64-bit default exactly.");
process.exit(0);
