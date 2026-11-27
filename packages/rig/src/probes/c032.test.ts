import { catalog } from "@wirelab/catalog";
import { describe, expect, it } from "vitest";
import { currentArm } from "../arms.ts";
import type { Outcome } from "../outcome.ts";
import { wireTargets } from "../targets/wire-targets.ts";
import { runWireProbe, wireCases, wireVerdict } from "./c032.ts";
import { caseProblems, type ReplyResult } from "./replies.ts";
import { writeReport } from "./report.ts";

/** The arm of this run, or undefined. The runs of the probe start only when `RIG` is `1`, as in `replies.test.ts`. */
const arm = currentArm(process.env);
const rigEnabled = process.env["RIG"] === "1" && arm === undefined;

/** The arm of this run is an arm of the wire probe: its class is C032, and each of its targets is a wire target. */
const wireArm = arm !== undefined && arm.arm.class === "C032" && arm.arm.targets.every((id) => wireTargets.some((one) => one.id === id));

/** The finding of each wire target. The trigger of each target fails on the version of the rig. */
const KNOWN: Readonly<Record<string, string>> = {
  "mqtt/suback-partial": "F0115",
  "mqtt/offline-subscribe": "F0120",
  "mqtt/unsuback-failure": "F0121",
  "rxjs/multiplex-submsg": "F0004",
};

/** This function gives one line for a case or a result: the target and the detail. */
const line = (one: { readonly target: string; readonly detail: string }): string => `${one.target} | ${one.detail}`;

/** This function gives each fail of `results` as one line. */
const failLines = (results: readonly ReplyResult[]): string[] => results.filter((one) => one.verdict === "fail").map(line);

/** This function gives the line of the trigger of each wire target of `targets`. Each one fails on the versions of the rig. */
const knownFails = (targets: readonly { readonly id: string }[]): string[] =>
  wireCases(wireTargets.filter((one) => targets.some((target) => target.id === one.id)))
    .filter((one) => one.control !== true)
    .map(line);

describe("the wire cases of C032", () => {
  const cases = wireCases(wireTargets);

  it("use only values of the catalog and targets of the rig", () => {
    expect(caseProblems(cases, wireTargets.map((one) => one.id))).toEqual([]);
  });

  it("give each target a control and a trigger", () => {
    for (const target of wireTargets) {
      const ofTarget = cases.filter((one) => one.target === target.id);
      expect(ofTarget.map((one) => one.control === true)).toEqual([true, false]);
    }
  });

  it("name a finding of C032 for each wire target", () => {
    const ofClass = catalog.findingClasses.filter((one) => one.class === "C032").map((one) => one.finding);
    expect(Object.keys(KNOWN).sort()).toEqual(wireTargets.map((one) => one.id).sort());
    for (const finding of Object.values(KNOWN)) expect(ofClass).toContain(finding);
  });
});

describe("the wire oracle of C032", () => {
  const value: Outcome = { kind: "value", values: ["a"] };
  const error: Outcome = { kind: "error", name: "Error", code: "", message: "m" };

  it("compares the kind of the outcome and the packets in order", () => {
    expect(wireVerdict({ outcome: value, wire: ["sub", "unsub"] }, { kind: "value", wire: ["sub", "unsub"] })).toBe("pass");
    expect(wireVerdict({ outcome: error, wire: ["unsub"] }, { kind: "error", wire: [] })).toBe("fail");
    expect(wireVerdict({ outcome: value, wire: ["x"] }, { kind: "error", wire: ["x"] })).toBe("fail");
    expect(wireVerdict({ outcome: value, wire: ["b", "a"] }, { kind: "value", wire: ["a", "b"] })).toBe("fail");
    expect(wireVerdict({ outcome: { kind: "timeout", limitMs: 1 }, wire: [] }, { kind: "value", wire: [] })).toBe("inconclusive");
  });
});

describe.runIf(rigEnabled)("the wire probe of C032 on each wire target", () => {
  it("finds the known instances again, and each control passes", async () => {
    const results = await runWireProbe(wireTargets);
    writeReport(results, "c032-wire");
    expect(results.filter((one) => one.control && one.verdict !== "pass").map(line)).toEqual([]);
    expect(failLines(results)).toEqual(knownFails(wireTargets));
  }, 120_000);
});

describe.runIf(process.env["RIG"] === "1" && wireArm)("the wire probe of C032 on an arm", () => {
  it("finds the known fails on the base commit, and no fail on the fix", async () => {
    if (arm === undefined) throw new Error("This run has no arm.");
    const targets = wireTargets.filter((one) => arm.arm.targets.includes(one.id));
    const results = await runWireProbe(targets);
    writeReport(results, `arm-${arm.arm.id}-${arm.kind}`);
    expect(results.filter((one) => one.control && one.verdict !== "pass").map(line)).toEqual([]);
    // The base build gives the fails of the release. Thus the build alone does not change the result.
    expect(failLines(results)).toEqual(arm.kind === "base" ? knownFails(targets) : []);
  }, 120_000);
});
