/**
 * The probe of the class C001 on the reply targets: a lookup keyed by wire text matches the keys of
 * `Object.prototype`. The code string of a Connect error is wire text, and the client looks it up. A key of
 * `Object.prototype` must give the fallback code, as an unknown code string does. The fallback of these cases is
 * `Unknown`: the HTTP status 500 and the `EndStreamResponse` both give it, and the control cases show it.
 *
 * The key cases use the oracle of the catalog on the key targets. A key of `Object.prototype` gives the outcome of a
 * random unknown key of the same shape. The comparison replaces each key with one mark.
 */
import { random, type Random } from "@mark1russell7/rigor-generators";
import { catalog } from "@wirelab/catalog";
import { concatBytes } from "../cuts.ts";
import { dimensionsOf } from "../matrix.ts";
import { outcomeText, type Outcome, type Verdict } from "../outcome.ts";
import { connectEndStream, envelope, stringValue } from "../targets/connect-web.ts";
import type { KeyTarget, ReplyTarget } from "../targets/target.ts";
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

/** One key case: the key, the random unknown key of the same shape, and the values of the dimensions. */
export interface KeyCase {
  readonly class: string;
  readonly target: string;
  readonly dims: Readonly<Record<string, string>>;
  readonly detail: string;
  /** A control case has two random keys. A fail of a control shows that the target does not give the same outcome twice. */
  readonly control?: boolean;
  /** The key of the case. */
  readonly key: string;
  /** The random unknown key that gives the expected outcome. */
  readonly baseline: string;
}

/** The lower-case letters of a random key. */
const LOWER = [..."abcdefghijklmnopqrstuvwxyz"];

/** The upper-case letters of a random key. */
const UPPER = LOWER.map((letter) => letter.toUpperCase());

/**
 * This function gives a random key with the shape of `key`. Each letter becomes a random letter of the same case, and
 * each other character stays. A grammar of names then treats the two keys the same. The random key is not `key` and not a key of `Object.prototype`.
 */
export function unknownKeyLike(key: string, draw: Random): string {
  for (;;) {
    const like = [...key].map((char) => (LOWER.includes(char) ? draw.pick(LOWER) : UPPER.includes(char) ? draw.pick(UPPER) : char)).join("");
    if (like !== key && !(like in Object.prototype)) return like;
  }
}

/** This function gives each key case of `targets`: a control, and each key of the dimension `key` of the catalog. */
export function keyCases(targets: readonly KeyTarget[]): KeyCase[] {
  const keys = dimensionsOf(catalog.classDimensions, CLASS_ID, ["key"])["key"] ?? [];
  return targets.flatMap((target) => {
    const draw = random(`${CLASS_ID}/${target.id}`);
    const control: KeyCase = { class: CLASS_ID, target: target.id, dims: {}, detail: "two random keys", control: true, key: unknownKeyLike("abcdefgh", draw), baseline: unknownKeyLike("abcdefgh", draw) };
    return [
      control,
      ...keys.map((key): KeyCase => ({
        class: CLASS_ID,
        target: target.id,
        dims: { key, phase: target.phase, table: target.table },
        detail: `key ${JSON.stringify(key)}`,
        key,
        baseline: unknownKeyLike(key, draw),
      })),
    ];
  });
}

/** This function gives `outcome` as text, with each place of `key` replaced by the mark `<key>`. */
export function maskedText(outcome: Outcome, key: string): string {
  return outcomeText(outcome).split(key).join("<key>");
}

/** This function is the oracle of C001: the two outcomes are equal after the mask. A timeout is inconclusive. */
export function sameAsBaseline(outcome: Outcome, key: string, baseline: Outcome, baselineKey: string): Verdict {
  if (outcome.kind === "timeout" || baseline.kind === "timeout") return "inconclusive";
  return maskedText(outcome, key) === maskedText(baseline, baselineKey) ? "pass" : "fail";
}

/** This function starts each key case on its target, one run at a time, and gives each result. */
export async function runKeyProbe(targets: readonly KeyTarget[], cases: readonly KeyCase[] = keyCases(targets)): Promise<ReplyResult[]> {
  const results: ReplyResult[] = [];
  for (const one of cases) {
    const target = targets.find((candidate) => candidate.id === one.target);
    if (target === undefined) continue;
    const outcome = await target.run(one.key);
    const baseline = await target.run(one.baseline);
    results.push({
      class: one.class,
      target: target.id,
      package: target.package,
      version: target.version,
      detail: one.detail,
      control: one.control === true,
      expected: `the outcome of the key ${JSON.stringify(one.baseline)}: ${maskedText(baseline, one.baseline)}`,
      verdict: sameAsBaseline(outcome, one.key, baseline, one.baseline),
      outcome: maskedText(outcome, one.key),
    });
  }
  return results;
}
