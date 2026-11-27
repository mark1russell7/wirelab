/** The targets of `bson`: a key target of the option `fieldsAsRaw` of `deserialize`, and a cause target of a cut int64 value. */
import { Long, deserialize, serialize } from "bson";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { CauseTarget, KeyTarget } from "./target.ts";

/** The package and the version of the target. The version is the version that the workspace installs. */
export const BSON = { package: "bson", version: "7.3.4" } as const;

/** This function gives the text of a value that `deserialize` gives: raw bytes, or the value as JSON. */
const valueText = (value: unknown): string => (value instanceof Uint8Array ? "raw bytes" : JSON.stringify(value) ?? "undefined");

/**
 * The key target of `fieldsAsRaw`. The document has an array field with the name `key` and an array field `plain`.
 * The option names only `plain`, with the value `false`, so neither field comes back as raw bytes.
 */
export const bsonFieldsAsRawTarget: KeyTarget = {
  id: "bson/fields-as-raw",
  ...BSON,
  table: "field or option name",
  phase: "open",
  run: (key): Promise<Outcome> =>
    outcomeOf(() => {
      const document: Record<string, unknown> = {};
      Object.defineProperty(document, key, { value: [{ x: 1 }], enumerable: true, configurable: true, writable: true });
      document["plain"] = [{ z: 3 }];
      const back = deserialize(serialize(document), { fieldsAsRaw: { plain: false } }) as Record<string, unknown>;
      const own = (name: string): unknown => Object.getOwnPropertyDescriptor(back, name)?.value;
      return Promise.resolve([`field ${valueText(own(key))}`, `plain ${valueText(own("plain"))}`]);
    }, 5_000),
};

/** This function gives a document with one int64 field whose value has only 3 of its 8 bytes. The size field is the cut size. */
function cutInt64Document(): Uint8Array {
  const whole = serialize({ n: Long.fromNumber(5) });
  const cut = whole.slice(0, whole.length - 6);
  new DataView(cut.buffer, cut.byteOffset).setInt32(0, cut.length, true);
  return cut;
}

/**
 * The cause target of F0165: `deserialize` of a cut int64 value. The default path throws `BSONError`. With the option
 * `useBigInt64`, the value becomes `BigInt(NaN)`, which throws `RangeError`.
 */
export const bsonCutInt64Target: CauseTarget = {
  id: "bson/cut-int64",
  ...BSON,
  state: "open",
  step: "BigInt of a cut value",
  reference: "deserialize of a cut int64 value",
  trigger: "deserialize of a cut int64 value with useBigInt64",
  run: (input): Promise<Outcome> =>
    outcomeOf(() => {
      deserialize(cutInt64Document(), { useBigInt64: input === "trigger" });
      return Promise.resolve(["deserialized"]);
    }, 5_000),
};
