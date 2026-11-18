// F0138: @msgpack/msgpack 3.1.3 encodes an Invalid Date (getTime() is NaN) with no error. encodeDateToTimeSpec gives NaN
// for sec and nsec, encodeTimeSpecToTimestamp then writes the timestamp 96 format, and DataView writes NaN as 0.
// Thus decode() gives the valid date 1970-01-01T00:00:00.000Z.
import { decode, encode } from "@msgpack/msgpack";

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex").replace(/(..)/g, "$1 ").trim();
const roundTrip = (date: Date): string => {
  let bytes: Uint8Array;
  try {
    bytes = encode(date);
  } catch (error) {
    return `encode() throws: ${String(error)}`;
  }
  const back = decode(bytes) as Date;
  return `bytes ${hex(bytes)}, decode() gives ${Number.isNaN(back.getTime()) ? "Invalid Date" : back.toISOString()}`;
};

const control = new Date("2026-11-17T12:34:56.789Z");
console.log(`control ${control.toISOString()}: ${roundTrip(control)}`);
const invalid = new Date(Number.NaN);
const result = roundTrip(invalid);
console.log(`Invalid Date: ${result}`);
const parsed = new Date("not a date");
console.log(`new Date("not a date"): ${roundTrip(parsed)}`);

if (result.includes("decode() gives 1970-01-01T00:00:00.000Z")) {
  console.log("BUG PRESENT: encode() writes an Invalid Date as the timestamp 0, so decode() gives the valid date 1970-01-01T00:00:00.000Z.");
  process.exit(1);
}
console.log("OK: an Invalid Date does not become a valid date.");
