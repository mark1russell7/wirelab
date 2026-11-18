// F0137: @msgpack/msgpack 3.1.3 encodes a string of 50 characters or fewer with utf8EncodeJs, and a longer string with
// TextEncoder.encodeInto. utf8EncodeJs writes a lone UTF-16 surrogate as the 3-byte form of the surrogate (ED A0 80 for
// U+D800), which is not valid UTF-8. TextEncoder writes U+FFFD (EF BF BD). The MessagePack str type holds UTF-8.
import { encode } from "@msgpack/msgpack";

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex").replace(/(..)/g, "$1 ").trim();
const strPayload = (bytes: Uint8Array): Uint8Array => {
  const head = bytes[0]!;
  if (head >= 0xa0 && head <= 0xbf) return bytes.subarray(1);
  if (head === 0xd9) return bytes.subarray(2);
  throw new Error(`not a fixstr or a str 8: ${head.toString(16)}`);
};
const isUtf8 = (bytes: Uint8Array): boolean => {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
};
const textEncoder = new TextEncoder();
const padding = "x".repeat(60);
const cases: Array<[string, string]> = [
  ["lone high surrogate at the end", "a\ud800"],
  ["lone low surrogate", "a\udc00b"],
  ["low surrogate before high surrogate", "\udc00\ud800"],
];
let faults = 0;
for (const [label, text] of cases) {
  for (const [size, value] of [["short", text], ["long", padding + text]] as const) {
    const payload = strPayload(encode(value));
    const expected = textEncoder.encode(value);
    const same = hex(payload) === hex(expected);
    if (!same) faults++;
    const tail = (bytes: Uint8Array): string => hex(bytes.subarray(Math.max(0, bytes.length - 6)));
    console.log(
      `${same ? "ok   " : "FAULT"} ${label}, ${size} (${value.length} characters): last bytes ${tail(payload)}, valid UTF-8: ${isUtf8(payload)}, TextEncoder: ${tail(expected)}`,
    );
  }
}
if (faults > 0) {
  console.log(`BUG PRESENT: ${faults} of ${cases.length * 2} strings encode a lone surrogate as bytes that are not valid UTF-8, but only when the string has 50 characters or fewer.`);
  process.exit(1);
}
console.log("OK: each string encodes as TextEncoder encodes it.");
