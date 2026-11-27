import { catalog } from "@wirelab/catalog";
import { describe, expect, it } from "vitest";
import { currentArm } from "../arms.ts";
import type { Outcome } from "../outcome.ts";
import { causeTargets } from "../targets/cause-targets.ts";
import { causeCases, causeShape, runCauseProbe, sameCause } from "./c003.ts";
import { caseProblems, type ReplyResult } from "./replies.ts";
import { writeReport } from "./report.ts";

/** The arm of this run, or undefined. The runs of the probe start only when `RIG` is `1`, as in `replies.test.ts`. */
const arm = currentArm(process.env);
const rigEnabled = process.env["RIG"] === "1" && arm === undefined;

/** The arm of this run is an arm of the cause probe: its class is C003, and each of its targets is a cause target. */
const causeArm = arm !== undefined && arm.arm.class === "C003" && arm.arm.targets.every((id) => causeTargets.some((one) => one.id === id));

/** The finding of each cause target. The trigger of each target fails on the version of the rig. */
const KNOWN: Readonly<Record<string, string>> = {
  "rxjs/websocket-codec": "F0002",
  "mqtt/publish-after-end": "F0117",
  "mqtt/end-before-connect": "F0122",
  "bson/cut-int64": "F0165",
  "graphql-request/bigint-variable": "F0182",
};

/** This function gives one line for a case or a result: the target and the detail. */
const line = (one: { readonly target: string; readonly detail: string }): string => `${one.target} | ${one.detail}`;

/** This function gives each fail of `results` as one line. */
const failLines = (results: readonly ReplyResult[]): string[] => results.filter((one) => one.verdict === "fail").map(line);

describe("the cause cases of C003", () => {
  const cases = causeCases(causeTargets);

  it("use only values of the catalog and targets of the rig", () => {
    expect(caseProblems(cases, causeTargets.map((one) => one.id))).toEqual([]);
  });

  it("give each target a control and a trigger", () => {
    for (const target of causeTargets) {
      const ofTarget = cases.filter((one) => one.target === target.id);
      expect(ofTarget.map((one) => one.control === true)).toEqual([true, false]);
    }
  });

  it("name a finding of C003 for each cause target", () => {
    const ofClass = catalog.findingClasses.filter((one) => one.class === "C003").map((one) => one.finding);
    expect(Object.keys(KNOWN).sort()).toEqual(causeTargets.map((one) => one.id).sort());
    for (const finding of Object.values(KNOWN)) expect(ofClass).toContain(finding);
  });
});

describe("the oracle of C003", () => {
  const error = (name: string, code = "", message = "m"): Outcome => ({ kind: "error", name, code, message });
  const value: Outcome = { kind: "value", values: ["a"] };

  it("compares the kind, and the class and the code of an error, not the message", () => {
    expect(causeShape(error("BSONError", "", "Bad BSON Document"))).toBe("error BSONError");
    expect(causeShape(error("ConnectError", "Unavailable"))).toBe("error ConnectError Unavailable");
    expect(sameCause(error("Error", "", "boom"), error("Error", "", "other"))).toBe("pass");
    expect(sameCause(error("TypeError"), error("Error"))).toBe("fail");
    expect(sameCause(error("Error", "a"), error("Error", "b"))).toBe("fail");
    expect(sameCause(error("TypeError"), value)).toBe("fail");
    expect(sameCause(value, { kind: "value", values: ["b"] })).toBe("pass");
    expect(sameCause({ kind: "timeout", limitMs: 1 }, value)).toBe("inconclusive");
  });
});

/** This function gives the line of the trigger of each cause target of `targets`. Each one fails on the versions of the rig. */
const knownFails = (targets: readonly { readonly id: string }[]): string[] =>
  causeCases(causeTargets.filter((one) => targets.some((target) => target.id === one.id)))
    .filter((one) => one.control !== true)
    .map(line);

describe.runIf(rigEnabled)("the cause probe of C003 on each cause target", () => {
  it("finds the known instances again, and each control passes", async () => {
    const results = await runCauseProbe(causeTargets);
    writeReport(results, "c003-causes");
    expect(results.filter((one) => one.control && one.verdict !== "pass").map(line)).toEqual([]);
    expect(failLines(results)).toEqual(knownFails(causeTargets));
  }, 120_000);
});

describe.runIf(process.env["RIG"] === "1" && causeArm)("the cause probe of C003 on an arm", () => {
  it("finds the known fails on the base commit, and no fail on the fix", async () => {
    if (arm === undefined) throw new Error("This run has no arm.");
    const targets = causeTargets.filter((one) => arm.arm.targets.includes(one.id));
    const results = await runCauseProbe(targets);
    writeReport(results, `arm-${arm.arm.id}-${arm.kind}`);
    expect(results.filter((one) => one.control && one.verdict !== "pass").map(line)).toEqual([]);
    // The base build gives the fails of the release. Thus the build alone does not change the result.
    expect(failLines(results)).toEqual(arm.kind === "base" ? knownFails(targets) : []);
  }, 120_000);
});
