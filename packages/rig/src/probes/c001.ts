/**
 * The probe of the class C001 on the reply targets: a lookup keyed by wire text matches the keys of
 * `Object.prototype`. The code string of a Connect error is wire text, and the client looks it up. A key of
 * `Object.prototype` must give the fallback code, as an unknown code string does. The fallback of these cases is
 * `Unknown`: the HTTP status 500 and the `EndStreamResponse` both give it, and the control cases show it.
 */
import { catalog } from "@wirelab/catalog";
import { concatBytes } from "../cuts.ts";
import { dimensionsOf } from "../matrix.ts";
import { connectEndStream, envelope, stringValue } from "../targets/connect-web.ts";
import type { ReplyTarget } from "../targets/target.ts";
import { expectCode, runReplyCases, type ReplyCase, type ReplyResult } from "./replies.ts";

/** The id of the class of this probe. */
export const CLASS_ID = "C001";

/** The code string of the control cases: a string that is not a code and not a key of `Object.prototype`. */
const CONTROL_KEY = "no_such_code";

/** This function gives the two cases of one code string: a unary error body and the error of an `EndStreamResponse`. */
function casesOf(key: string, control: boolean): ReplyCase[] {
  const shared = { class: CLASS_ID, expected: "error Unknown", judge: expectCode("Unknown"), ...(control ? { control } : {}) };
  const dims = (phase: string): Record<string, string> => (control ? {} : { key, phase, table: "error or code name" });
  return [
    {
      ...shared,
      target: "connect-web/connect-unary",
      dims: dims("open"),
      detail: `unary error body {"code":"${key}"} with HTTP 500`,
      reply: { status: 500, fields: { "content-type": "application/json" }, body: JSON.stringify({ code: key, message: "boom" }) },
    },
    {
      ...shared,
      target: "connect-web/connect-stream",
      dims: dims("stream"),
      detail: `EndStreamResponse {"error":{"code":"${key}"}}`,
      reply: {
        status: 200,
        fields: { "content-type": "application/connect+proto" },
        body: concatBytes([envelope(0, stringValue("a")).bytes, connectEndStream({ error: { code: key, message: "boom" } })]),
      },
    },
  ];
}

/** This function gives each case of the probe: each key of the dimension `key` of the catalog, and the controls. */
export function cases(): ReplyCase[] {
  const keys = dimensionsOf(catalog.classDimensions, CLASS_ID, ["key"])["key"] ?? [];
  return [...casesOf(CONTROL_KEY, true), ...keys.flatMap((key) => casesOf(key, false))];
}

/** This function starts the probe on `targets` and gives each result. */
export function runProbe(targets: readonly ReplyTarget[]): Promise<ReplyResult[]> {
  return runReplyCases(cases(), targets);
}
