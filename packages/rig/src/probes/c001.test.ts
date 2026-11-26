import { random } from "@mark1russell7/rigor-generators";
import { catalog } from "@wirelab/catalog";
import { describe, expect, it } from "vitest";
import { currentArm } from "../arms.ts";
import type { Outcome } from "../outcome.ts";
import { keyTargets } from "../targets/key-targets.ts";
import { keyCases, maskedText, runKeyProbe, sameAsBaseline, unknownKeyLike } from "./c001.ts";
import { caseProblems, type ReplyResult } from "./replies.ts";
import { writeReport } from "./report.ts";

/** The runs of the probe start only when `RIG` is `1` and the run has no arm, as in `replies.test.ts`. */
const rigEnabled = process.env["RIG"] === "1" && currentArm(process.env) === undefined;

/**
 * The finding of each key target, and the keys that pass on the version of the rig. Each other key of the catalog
 * fails: the client finds the key on `Object.prototype`.
 */
const KNOWN: Readonly<Record<string, { readonly finding: string; readonly passes: readonly string[] }>> = {
  "pusher-js/channel": { finding: "F0073", passes: [] },
  // The client changes each method name to lower case, so only `constructor` and `__proto__` stay keys of the prototype.
  "signalr/client-method": {
    finding: "F0108",
    passes: ["toString", "valueOf", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "__defineGetter__", "toLocaleString"],
  },
  "hls.js/variable": { finding: "F0132", passes: [] },
  "hls.js/date-range": { finding: "F0133", passes: [] },
  "aws-sdk/s3-event-type": { finding: "F0139", passes: [] },
  // The parser keeps an entity name with `_` as text. It does the same for the random key of the same shape.
  "aws-sdk/s3-xml-entity": { finding: "F0144", passes: ["__proto__", "__defineGetter__"] },
  "bson/fields-as-raw": { finding: "F0162", passes: [] },
  "msgpackr/error-name": { finding: "F0202", passes: [] },
  "stompjs/message": { finding: "F0225", passes: [] },
  "stompjs/receipt": { finding: "F0225", passes: [] },
};

/** This function gives one line for a result: the target and the detail. */
const line = (one: { readonly target: string; readonly detail: string }): string => `${one.target} | ${one.detail}`;

/** This function gives each fail of `results` as one line. */
const failLines = (results: readonly ReplyResult[]): string[] => results.filter((one) => one.verdict === "fail").map(line);

describe("the key cases of C001", () => {
  const cases = keyCases(keyTargets);

  it("use only values of the catalog and targets of the rig", () => {
    expect(caseProblems(cases, keyTargets.map((one) => one.id))).toEqual([]);
  });

  it("give each target a control and a case for each key of the catalog", () => {
    for (const target of keyTargets) {
      const ofTarget = cases.filter((one) => one.target === target.id);
      expect(ofTarget.filter((one) => one.control === true)).toHaveLength(1);
      expect(ofTarget.filter((one) => one.control !== true).map((one) => one.dims["key"])).toContain("__proto__");
    }
  });

  it("give each key a random baseline of the same shape that is not a key of Object.prototype", () => {
    const shape = (key: string): string => key.replace(/[a-z]/g, "a").replace(/[A-Z]/g, "A");
    for (const one of cases) {
      expect(shape(one.baseline)).toBe(shape(one.key));
      expect(one.baseline in Object.prototype).toBe(false);
    }
    expect(keyCases(keyTargets)).toEqual(cases);
  });

  it("unknownKeyLike keeps the case of each letter and each other character", () => {
    expect(unknownKeyLike("__defineGetter__", random("c001-test"))).toMatch(/^__[a-z]{6}[A-Z][a-z]{5}__$/);
  });
});

describe("the known instances of the key targets", () => {
  it("name a finding of C001 for each key target", () => {
    const ofClass = catalog.findingClasses.filter((one) => one.class === "C001").map((one) => one.finding);
    expect(Object.keys(KNOWN).sort()).toEqual(keyTargets.map((one) => one.id).sort());
    for (const { finding } of Object.values(KNOWN)) expect(ofClass).toContain(finding);
  });
});

describe("the oracle of C001", () => {
  const value = (...values: string[]): Outcome => ({ kind: "value", values });

  it("masks each place of the key", () => {
    expect(maskedText(value("subscribe ok", 'subscribed ["abc"]'), "abc")).toBe('value ["subscribe ok","subscribed [\\"<key>\\"]"]');
  });

  it("passes only an outcome equal to the baseline after the mask", () => {
    expect(sameAsBaseline(value("key toString"), "toString", value("key qwertyui"), "qwertyui")).toBe("pass");
    expect(sameAsBaseline(value("key function toString() { [native code] }"), "toString", value("key qwertyui"), "qwertyui")).toBe("fail");
    const error: Outcome = { kind: "error", name: "TypeError", code: "", message: "x.indexOf is not a function" };
    expect(sameAsBaseline(error, "constructor", value("on ok"), "abcdefghijk")).toBe("fail");
    expect(sameAsBaseline({ kind: "timeout", limitMs: 1 }, "a", value(), "b")).toBe("inconclusive");
  });
});

describe.runIf(rigEnabled)("the key probe of C001 on each key target", () => {
  it("finds the known instances again, and each control passes", async () => {
    const results = await runKeyProbe(keyTargets);
    writeReport(results, "c001-keys");
    expect(results.filter((one) => one.control && one.verdict !== "pass").map(line)).toEqual([]);
    const expected = keyCases(keyTargets)
      .filter((one) => one.control !== true && !(KNOWN[one.target]?.passes ?? []).includes(one.key))
      .map(line);
    expect(failLines(results)).toEqual(expected);
  }, 120_000);
});
