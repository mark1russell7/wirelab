/** The key target of `bson`: the name of a field in the option `fieldsAsRaw` of `deserialize`. */
import { deserialize, serialize } from "bson";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { KeyTarget } from "./target.ts";

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
