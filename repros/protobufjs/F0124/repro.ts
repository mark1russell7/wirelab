// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// A JavaScript string can hold a lone UTF-16 surrogate, for example text cut in the middle of an emoji.
// TextEncoder and Buffer write U+FFFD (EF BF BD) for it. util.utf8.write of protobufjs writes ED A0 80, which is
// not valid UTF-8. A proto3 message with this string encodes without an error, but the decoder of protobufjs
// (utf8_validation VERIFY) then rejects the bytes that protobufjs wrote.
import protobuf from "protobufjs";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

// "a" and a lone high surrogate
const text = "a\uD800";
const expected = hex(new TextEncoder().encode(text));

// Writer.create() gives a BufferWriter on Node.js. It uses util.utf8.write for a string of fewer than 40 chars.
const shortBytes = protobuf.Writer.create().string(text).finish();
// The plain Writer (the browser path) uses util.utf8.write for each string that is not ASCII.
const plainBytes = new protobuf.Writer().string(text).finish();
console.log(`TextEncoder:            ${expected}`);
console.log(`BufferWriter.string():  ${hex(shortBytes.subarray(1))}`);
console.log(`Writer.string():        ${hex(plainBytes.subarray(1))}`);

const root = protobuf.parse('syntax = "proto3"; message M { string s = 1; }').root;
const M = root.lookupType("M");
const encoded = M.encode(M.create({ s: text })).finish();
let roundTrip: string;
try {
  roundTrip = `decoded ${JSON.stringify((M.decode(encoded) as unknown as { s: string }).s)}`;
} catch (error) {
  roundTrip = `decode threw ${(error as Error).name}: ${(error as Error).message}`;
}
console.log(`proto3 encode ${hex(encoded)}, then ${roundTrip}`);

const wrong = hex(shortBytes.subarray(1)) !== expected || hex(plainBytes.subarray(1)) !== expected;
if (wrong || roundTrip.includes("threw")) {
  console.log("BUG PRESENT: protobufjs writes a lone surrogate as invalid UTF-8, and cannot decode its own proto3 output.");
  process.exit(1);
}
console.log("OK: protobufjs writes a lone surrogate as U+FFFD, and decodes its own proto3 output.");
process.exit(0);
