// msgpackr 2.1.4. With structuredClone: true and useRecords: false, an object that refers to itself packs, but
// unpack() throws. The id extension (0x69) of unpack.js makes the placeholder from the next token: a msgpack map
// gives a Map. But with mapsAsObjects (the default when useRecords is false), the map reads as a plain object, and
// the copy step calls targetProperties.entries(), which a plain object does not have.
import { Packr, Unpackr } from "msgpackr";

const options = { structuredClone: true, useRecords: false };
const packr = new Packr(options);
const unpackr = new Unpackr(options);

const results: string[] = [];
let failed = 0;
const check = (label: string, value: unknown, same: (out: any) => boolean) => {
  try {
    const out = unpackr.unpack(packr.pack(value));
    const ok = same(out);
    if (!ok) failed += 1;
    results.push(`${label}: ${ok ? "the cycle comes back" : "WRONG result"}`);
  } catch (error) {
    failed += 1;
    results.push(`${label}: unpack throws ${(error as Error).name}: ${(error as Error).message}`);
  }
};

const object: Record<string, unknown> = { name: "a" };
object.self = object;
check("object that refers to itself", object, (out) => out?.self === out && out?.name === "a");

const array: unknown[] = [1];
array.push(array);
check("array that refers to itself (control)", array, (out) => out?.[1] === out);

const outer = { child: { name: "b" } as Record<string, unknown> };
outer.child.parent = outer;
check("parent and child objects", outer, (out) => out?.child?.parent === out);

for (const line of results) console.log(line);
console.log("expected: each value comes back with its cycle, as with useRecords: true");
console.log(failed > 0 ? `BUG PRESENT (${failed} of ${results.length} failed)` : "BUG ABSENT");
process.exitCode = failed > 0 ? 1 : 0;
