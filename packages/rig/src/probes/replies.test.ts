import { describe, expect, it } from "vitest";
import { currentArm } from "../arms.ts";
import type { Outcome } from "../outcome.ts";
import { connectWebReplyTargets } from "../targets/connect-web.ts";
import * as c001 from "./c001.ts";
import * as c003 from "./c003.ts";
import * as c032 from "./c032.ts";
import * as c033 from "./c033.ts";
import * as c034 from "./c034.ts";
import { caseProblems, expectCode, expectError, expectTrailer, type ReplyCase, type ReplyResult } from "./replies.ts";
import { writeReport } from "./report.ts";

/** The arm of this run, or undefined. The runs of the probes start only when `RIG` is `1`, as in `c017.test.ts`. */
const arm = currentArm(process.env);
const rigEnabled = process.env["RIG"] === "1" && arm === undefined;

/** One reply probe: its class, its cases and its run. */
interface Probe {
  readonly CLASS_ID: string;
  readonly cases: () => ReplyCase[];
  readonly runProbe: typeof c001.runProbe;
}

/**
 * Each reply probe, with the cases that fail on `@connectrpc/connect-web` 2.3.0. These fails are the candidates of the
 * W16 review of connect-web: c4 (C001), c5 (C003), c11 (C032), c6 (C033), and c2 and c3 (C034).
 */
const PROBES: readonly (readonly [Probe, (one: ReplyCase) => boolean])[] = [
  // Each key of `Object.prototype` gives a code that is not a code.
  [c001, () => true],
  // Each bad escape replaces the code of the wire.
  [c003, () => true],
  // A trailers-only stream loses its trailers.
  [c032, () => true],
  // The details with the code 0 hide the status 13. The bodies that are not an object give an error.
  [c033, (one) => one.dims["status"] === "grpc-status 13 with details code 0"],
  // A body that is not JSON loses the code of the HTTP status. The status 422 gives `Unknown`, as the parse error
  // does, so that case passes by chance. A stream with no end marker gives `Unknown`.
  [
    c034,
    (one) =>
      one.dims["status"] === "stream with no end marker" ||
      (["not JSON", "empty"].includes(one.dims["body"] ?? "") && ["HTTP 400", "HTTP 503"].includes(one.dims["status"] ?? "")),
  ],
];

/** This function gives one line for a case or a result: the target and the detail. */
const line = (one: { readonly target: string; readonly detail: string }): string => `${one.target} | ${one.detail}`;

/** This function gives each fail of `results` as one line. */
const failLines = (results: readonly ReplyResult[]): string[] => results.filter((one) => one.verdict === "fail").map(line);

describe("the reply probes: the cases and the catalog", () => {
  const ids = connectWebReplyTargets.map((one) => one.id);

  it.each(PROBES.map(([probe]) => [probe.CLASS_ID, probe] as const))("%s uses only values of the catalog and targets of the rig", (_, probe) => {
    expect(caseProblems(probe.cases(), ids)).toEqual([]);
  });

  it.each(PROBES.map(([probe]) => [probe.CLASS_ID, probe] as const))("%s has a control case and a case that is not a control", (_, probe) => {
    const cases = probe.cases();
    expect(cases.some((one) => one.control === true)).toBe(true);
    expect(cases.some((one) => one.control !== true)).toBe(true);
    expect(cases.every((one) => one.class === probe.CLASS_ID)).toBe(true);
  });

  it("finds each problem of a case", () => {
    const one: ReplyCase = { ...(c001.cases()[2] as ReplyCase), dims: { key: "nope", colour: "red" }, target: "none" };
    expect(caseProblems([one], ids)).toEqual([
      'C001: the dimension "key" has no value "nope".',
      'C001: the catalog has no dimension "colour".',
      'C001: the rig has no target "none".',
    ]);
  });
});

describe("the judges", () => {
  const error = (code: string): Outcome => ({ kind: "error", name: "ConnectError", code, message: "m" });
  const value: Outcome = { kind: "value", values: ["a"], trailers: [["x-t", "v"]] };
  const timeout: Outcome = { kind: "timeout", limitMs: 1 };

  it("expectCode passes only an error with the code", () => {
    expect(expectCode("Internal")(error("Internal"))).toBe("pass");
    expect(expectCode("Internal")(error("Unknown"))).toBe("fail");
    expect(expectCode("Internal")(value)).toBe("fail");
    expect(expectCode("Internal")(timeout)).toBe("inconclusive");
  });

  it("expectError passes each error", () => {
    expect(expectError()(error("Unknown"))).toBe("pass");
    expect(expectError()(value)).toBe("fail");
    expect(expectError()(timeout)).toBe("inconclusive");
  });

  it("expectTrailer passes only a value with the trailer", () => {
    expect(expectTrailer("x-t", "v")(value)).toBe("pass");
    expect(expectTrailer("x-t", "w")(value)).toBe("fail");
    expect(expectTrailer("x-t", "v")({ kind: "value", values: ["a"] })).toBe("fail");
    expect(expectTrailer("x-t", "v")(error("Unknown"))).toBe("fail");
  });
});

describe.runIf(rigEnabled)("the reply probes on @connectrpc/connect-web", () => {
  it.each(PROBES.map(([probe, fails]) => [probe.CLASS_ID, probe, fails] as const))(
    "%s finds the known instances again, and each control passes",
    async (id, probe, fails) => {
      const results = await probe.runProbe(connectWebReplyTargets);
      writeReport(results, id.toLowerCase());
      expect(results.filter((one) => one.control && one.verdict !== "pass").map(line)).toEqual([]);
      expect(failLines(results)).toEqual(
        probe
          .cases()
          .filter((one) => one.control !== true && fails(one))
          .map(line),
      );
    },
    120_000,
  );
});

describe.runIf(process.env["RIG"] === "1" && PROBES.some(([probe]) => probe.CLASS_ID === arm?.arm.class))("a reply probe on an arm", () => {
  it("finds the fault again on the base commit, and no fault on the commit of the fix", async () => {
    if (arm === undefined) throw new Error("This run has no arm.");
    const found = PROBES.find(([probe]) => probe.CLASS_ID === arm.arm.class);
    if (found === undefined) throw new Error(`No reply probe has the class ${arm.arm.class}.`);
    const targets = arm.arm.targets.map((id) => {
      const target = connectWebReplyTargets.find((one) => one.id === id);
      if (target === undefined) throw new Error(`The rig has no reply target "${id}".`);
      return target;
    });
    const results = await found[0].runProbe(targets);
    writeReport(results, `arm-${arm.arm.id}-${arm.kind}`);
    expect(results.filter((one) => one.control && one.verdict !== "pass").map(line)).toEqual([]);
    if (arm.kind === "base") expect(failLines(results)).not.toEqual([]);
    else expect(failLines(results)).toEqual([]);
  }, 120_000);
});
