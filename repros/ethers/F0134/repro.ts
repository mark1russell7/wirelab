// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// The docs of Utf8ErrorFuncs in utils/utf8.ts: "ignore" silently drops any illegal UTF-8 sequence, and "replace" puts
// U+FFFD in place of any illegal UTF-8 sequence. When a lead byte declares more bytes than the data has (the reason
// OVERRUN), ignoreFunc returns bytes.length - offset - 1, so the decoder skips to the end of the data. The bytes after
// the lead byte are dropped, also when they are valid characters. The WHATWG Encoding Standard (TextDecoder) gives
// one U+FFFD for the truncated sequence and then decodes the next bytes.
import { toUtf8String, Utf8ErrorFuncs } from "ethers";

const cases: number[][] = [
  [0xe2, 0x41], // a lead byte of 3 bytes, then "A"
  [0xf0, 0x41, 0x42], // a lead byte of 4 bytes, then "AB"
  // The control: a truncated euro sign before the end of the data is the reason MISSING_CONTINUE, which is correct.
  [0x48, 0x69, 0xe2, 0x82, 0x0a],
];

const show = (text: string) => JSON.stringify(text);
let bad = false;
for (const bytes of cases) {
  const data = new Uint8Array(bytes);
  const hex = Buffer.from(data).toString("hex");
  const expected = new TextDecoder().decode(data);
  const replaced = toUtf8String(data, Utf8ErrorFuncs.replace);
  const ignored = toUtf8String(data, Utf8ErrorFuncs.ignore);
  const expectedIgnore = expected.replaceAll("�", "");
  console.log(`${hex}: replace ${show(replaced)} (TextDecoder ${show(expected)}), ignore ${show(ignored)} (expected ${show(expectedIgnore)})`);
  if (replaced !== expected || ignored !== expectedIgnore) bad = true;
}

if (bad) {
  console.log("BUG PRESENT: after a truncated multi-byte sequence, Utf8ErrorFuncs.replace and .ignore drop the valid bytes that follow it.");
  process.exit(1);
}
console.log("OK: replace and ignore keep the valid bytes after a truncated sequence.");
process.exit(0);
