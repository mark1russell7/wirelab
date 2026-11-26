import { describe, expect, it } from "vitest";
import { currentArm } from "../arms.ts";
import { concatBytes, type FramedStream } from "../cuts.ts";
import { notDeliveredAfterEnd, type Outcome } from "../outcome.ts";
import { apacheArrowTarget } from "../targets/apache-arrow.ts";
import { awsSdkS3Target } from "../targets/aws-sdk-s3.ts";
import { connectWebTargets } from "../targets/connect-web.ts";
import { CLASS_ID, adapterProblems, extraCases, runProbe } from "./c016.ts";
import { writeReport } from "./report.ts";

/** The arm of this run, or undefined. The runs of the probe start only when `RIG` is `1`, as in `c017.test.ts`. */
const arm = currentArm(process.env);
const rigEnabled = process.env["RIG"] === "1" && arm === undefined;

/** Each target of the rig. The probe examines only the targets with a rule `afterEnd`. */
const targets = [...connectWebTargets, apacheArrowTarget, awsSdkS3Target];

/** This function gives each fail as one line: the target, the place and the frame. */
const failLines = (results: Awaited<ReturnType<typeof runProbe>>): string[] =>
  results.filter((one) => one.verdict === "fail").map((one) => `${one.target} | ${one.after} | ${one.frame}`);

describe("C016: the adapter and the catalog", () => {
  it("uses only values of the dimensions of C016 in the catalog", () => {
    expect(adapterProblems()).toEqual([]);
  });

  it("has a rule for each Connect and gRPC-web target, and no rule for a target with no end marker", () => {
    expect(targets.map((one) => one.afterEnd)).toEqual(["refuse", "refuse", "refuse", undefined, undefined]);
  });
});

describe("extraCases", () => {
  const bytes = (fill: number, length: number): Uint8Array => new Uint8Array(length).fill(fill);
  const stream: FramedStream = { frames: [1, 2, 3].map((fill) => ({ bytes: bytes(fill, 2), prefix: 1 })) };
  const whole = concatBytes(stream.frames.map((one) => one.bytes));

  it("adds a copy of the first frame or of the end marker after the stream, or after a second end marker", () => {
    const cases = extraCases(stream);
    expect(cases.map((one) => `${one.after} | ${one.frame}`)).toEqual([
      "end-of-stream frame | data",
      "end-of-stream frame | trailer",
      "second end-of-stream | data",
    ]);
    expect(cases.map((one) => Array.from(one.bytes))).toEqual([
      Array.from(concatBytes([whole, bytes(1, 2)])),
      Array.from(concatBytes([whole, bytes(3, 2)])),
      Array.from(concatBytes([whole, bytes(3, 2), bytes(1, 2)])),
    ]);
  });

  it("gives no case for a stream with fewer than 2 frames", () => {
    expect(extraCases({ frames: stream.frames.slice(0, 1) })).toEqual([]);
    expect(extraCases({ frames: [] })).toEqual([]);
  });
});

describe("notDeliveredAfterEnd", () => {
  const value = (values: string[]): Outcome => ({ kind: "value", values });
  const error: Outcome = { kind: "error", name: "ConnectError", code: "invalid_argument", message: "extra" };
  const control = value(["a", "b"]);

  it("passes only an error for the rule refuse", () => {
    expect(notDeliveredAfterEnd(error, "refuse", control)).toBe("pass");
    expect(notDeliveredAfterEnd(control, "refuse", control)).toBe("fail");
  });

  it("passes an error or the values of the control for the rule ignore", () => {
    expect(notDeliveredAfterEnd(error, "ignore", control)).toBe("pass");
    expect(notDeliveredAfterEnd(value(["a", "b"]), "ignore", control)).toBe("pass");
    expect(notDeliveredAfterEnd(value(["a", "b", "a"]), "ignore", control)).toBe("fail");
  });

  it("gives inconclusive for a timeout, or for a control with no value", () => {
    expect(notDeliveredAfterEnd({ kind: "timeout", limitMs: 1 }, "refuse", control)).toBe("inconclusive");
    expect(notDeliveredAfterEnd(control, "ignore", error)).toBe("inconclusive");
  });
});

describe.runIf(rigEnabled)("C016 on @connectrpc/connect-web", () => {
  it("finds the known instance again: the Connect stream delivers frames after the EndStreamResponse", async () => {
    const results = await runProbe(targets);
    writeReport(results, "c016");
    // The known instance: the candidate c1 of the W16 review of connect-web 2.3.0.
    expect(failLines(results)).toEqual([
      "connect-web/connect-stream | end-of-stream frame | data",
      "connect-web/connect-stream | end-of-stream frame | trailer",
      "connect-web/connect-stream | second end-of-stream | data",
    ]);
  }, 120_000);
});

describe.runIf(process.env["RIG"] === "1" && arm?.arm.class === CLASS_ID)("C016 on an arm", () => {
  it("finds the fault again on the base commit, and no fault on the commit of the fix", async () => {
    if (arm === undefined) throw new Error("This run has no arm.");
    const armTargets = arm.arm.targets.map((id) => {
      const target = targets.find((one) => one.id === id);
      if (target === undefined) throw new Error(`The rig has no target "${id}".`);
      return target;
    });
    const results = await runProbe(armTargets);
    writeReport(results, `arm-${arm.arm.id}-${arm.kind}`);
    if (arm.kind === "base") expect(failLines(results)).not.toEqual([]);
    else expect(failLines(results)).toEqual([]);
  }, 120_000);
});
