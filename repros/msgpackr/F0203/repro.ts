// msgpackr 2.1.4. With useFloat32: DECIMAL_ROUND (or DECIMAL_FIT), unpack() rounds each float32 (0xca) to the
// decimal digits that a float32 holds: ((multiplier * value + 0.5) >> 0) / multiplier. The >> 0 makes Infinity,
// -Infinity and NaN into 0. msgpackr itself packs these values as float64, but another encoder can send them as
// float32, and the msgpack format allows it.
import { FLOAT32_OPTIONS, Unpackr, roundFloat32 } from "msgpackr";

const float32 = (value: number) => {
  const bytes = new Uint8Array(5);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, 0xca);
  view.setFloat32(1, value);
  return bytes;
};
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const same = (a: number, b: number) => Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b));

let failed = 0;
for (const mode of ["DECIMAL_ROUND", "DECIMAL_FIT"] as const) {
  const unpackr = new Unpackr({ useFloat32: FLOAT32_OPTIONS[mode] });
  for (const value of [Infinity, -Infinity, Number.NaN, 1.5]) {
    const bytes = float32(value);
    const out = unpackr.unpack(bytes) as number;
    const ok = same(out, value);
    if (!ok) failed += 1;
    console.log(`${mode}: unpack(${hex(bytes)}) = ${out}, the float32 is ${value}${ok ? "" : "  <- WRONG"}`);
  }
}
for (const value of [Infinity, -Infinity, Number.NaN]) {
  const out = roundFloat32(value);
  if (!same(out, value)) failed += 1;
  console.log(`roundFloat32(${value}) = ${out}${same(out, value) ? "" : "  <- WRONG"}`);
}
const plain = new Unpackr().unpack(float32(Infinity));
console.log(`control, no useFloat32: unpack(${hex(float32(Infinity))}) = ${plain}`);
console.log("expected: Infinity, -Infinity and NaN stay as they are, as without useFloat32");
console.log(failed > 0 ? `BUG PRESENT (${failed} wrong values)` : "BUG ABSENT");
process.exitCode = failed > 0 ? 1 : 0;
