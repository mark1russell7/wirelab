// msgpackr 2.1.4. With moreTypes: true, an Error packs as [name, message, cause]. On unpack, the extension of
// unpack.js calls errors[data[0]](...) with no own-property check. So an Error whose name is a member of
// Object.prototype (constructor, toString, valueOf, hasOwnProperty, __proto__) does not come back as an Error:
// it comes back as a String, a string, a boolean or an object, or unpack() throws.
import { Packr, Unpackr } from "msgpackr";

const packr = new Packr({ moreTypes: true });
const unpackr = new Unpackr({ moreTypes: true });

const describe = (value: unknown) =>
  value instanceof Error
    ? `Error (constructor ${value.constructor.name}, name ${JSON.stringify(value.name)}, message ${JSON.stringify(value.message)})`
    : `${typeof value} ${Object.prototype.toString.call(value)} ${JSON.stringify(String(value))}`;

let failed = 0;
const names = ["TypeError", "MyError", "constructor", "toString", "valueOf", "hasOwnProperty", "isPrototypeOf", "__proto__"];
for (const name of names) {
  const error = new Error("boom");
  error.name = name;
  let line: string;
  try {
    const out = unpackr.unpack(packr.pack(error));
    const ok = out instanceof Error && out.name === name && out.message === "boom";
    if (!ok) failed += 1;
    line = `${describe(out)}${ok ? "" : "  <- WRONG"}`;
  } catch (e) {
    failed += 1;
    line = `unpack throws ${(e as Error).name}: ${(e as Error).message}  <- WRONG`;
  }
  console.log(`name ${JSON.stringify(name)}: ${line}`);
}
console.log("expected: each value comes back as an Error with its name and the message \"boom\"");
console.log(failed > 0 ? `BUG PRESENT (${failed} of ${names.length} names)` : "BUG ABSENT");
process.exitCode = failed > 0 ? 1 : 0;
