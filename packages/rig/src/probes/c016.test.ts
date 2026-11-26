import { describe, expect, it } from "vitest";
import { currentArm } from "../arms.ts";
import { concatBytes, type FramedStream } from "../cuts.ts";
import { notDeliveredAfterEnd, type Outcome } from "../outcome.ts";
import { apacheArrowTarget } from "../targets/apache-arrow.ts";
import { awsSdkS3Target } from "../targets/aws-sdk-s3.ts";
import { connectWebTargets } from "../targets/connect-web.ts";
import { graphqlWsTargets } from "../targets/graphql-ws.ts";
import { signalrTarget } from "../targets/signalr.ts";
import { framesOf, sockjsClientTargets } from "../targets/sockjs-client.ts";
import { CLASS_ID, adapterProblems, extraCases, notCrossedAfterEnd, runProbe, runSessionProbe, sessionCaseProblems, sessionKey, type SessionResult } from "./c016.ts";
import { writeReport } from "./report.ts";

/** The arm of this run, or undefined. The runs of the probe start only when `RIG` is `1`, as in `c017.test.ts`. */
const arm = currentArm(process.env);
const rigEnabled = process.env["RIG"] === "1" && arm === undefined;

/** Each target of the rig. The probe examines only the targets with a rule `afterEnd`. */
const targets = [...connectWebTargets, apacheArrowTarget, awsSdkS3Target];

/** Each session target of the rig. */
const sessionTargets = [...sockjsClientTargets, signalrTarget, ...graphqlWsTargets];

/** This function gives each session result that is not a pass as one line: the verdict, the target and the case. */
const sessionLines = (results: readonly SessionResult[]): string[] =>
  results.filter((one) => one.verdict !== "pass").map((one) => `${one.verdict} | ${one.target} | ${sessionKey(one)}`);

/** This function gives each fail as one line: the target, the place and the frame. */
const failLines = (results: Awaited<ReturnType<typeof runProbe>>): string[] =>
  results.filter((one) => one.verdict === "fail").map((one) => `${one.target} | ${one.after} | ${one.frame}`);

describe("C016: the adapter and the catalog", () => {
  it("uses only values of the dimensions of C016 in the catalog", () => {
    expect(adapterProblems()).toEqual([]);
  });

  it("uses only values of the catalog in each case of a session target, and each case once", () => {
    expect(sessionCaseProblems(sessionTargets)).toEqual([]);
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

describe("notCrossedAfterEnd", () => {
  it("passes a run with no item after the end, and fails a run with one", () => {
    expect(notCrossedAfterEnd({ before: ["next 1"], after: [] })).toBe("pass");
    expect(notCrossedAfterEnd({ before: ["next 1"], after: ["next late"] })).toBe("fail");
  });

  it("gives inconclusive for a run with no item of the valid session", () => {
    expect(notCrossedAfterEnd({ before: [], after: [] })).toBe("inconclusive");
    expect(notCrossedAfterEnd({ before: [], after: ["next late"] })).toBe("inconclusive");
  });
});

describe("the frames of the sockjs-client cases", () => {
  it("put each item after the end, with the text late", () => {
    const [target] = sockjsClientTargets;
    if (target === undefined) throw new Error("The rig has no sockjs-client target.");
    expect(target.cases.map((one) => framesOf(one).join(" "))).toEqual([
      'o a["1","late","late"]',
      'o a["1"] a["late"]',
      'o a["1"] c[3000,"end"] a["late"]',
      'o a["1"] c[3000,"end"] c[3001,"late"]',
      'o a["1"] c[3000,"end"] c[3000,"end"] a["late"]',
    ]);
  });
});

describe.runIf(rigEnabled)("C016 on the session targets", () => {
  it("finds the known instances again: F0069 (sockjs-client), F0105 (@microsoft/signalr), F0204 and F0234 (graphql-ws)", async () => {
    const results = await runSessionProbe(sessionTargets);
    writeReport(results, "c016-sessions");
    expect(sessionLines(results)).toEqual([
      // F0069: the loop of an array frame does not examine readyState.
      "fail | sockjs-client/websocket | local close() | message batch | inbound | websocket",
      "fail | sockjs-client/xhr-streaming | local close() | message batch | inbound | xhr-streaming",
      "fail | sockjs-client/xhr-polling | local close() | message batch | inbound | xhr-polling",
      "fail | sockjs-client/eventsource | local close() | message batch | inbound | eventsource",
      // F0105: the subscription of an upload stream stays after the end of the call.
      "fail | signalr/hub-connection | completion of the peer | data | outbound | invoke with an upload",
      "fail | signalr/hub-connection | completion of the peer | trailer | outbound | invoke with an upload",
      "fail | signalr/hub-connection | local close() | data | outbound | stream with an upload, dispose()",
      "fail | signalr/hub-connection | local close() | trailer | outbound | stream with an upload, dispose()",
      // F0204: a completed query answers for a new operation with the same id.
      "fail | graphql-ws/server | completion of the peer | data | outbound | query, id re-used",
      "fail | graphql-ws/server | completion of the peer | trailer | outbound | query, id re-used",
      // F0234: a completed subscription yields once more, and the loop of the server sends it with no check.
      "fail | graphql-ws/server | completion of the peer | data | outbound | subscription, id re-used",
      "fail | graphql-ws/server | completion of the peer | data | outbound | subscription, id not re-used",
      // F0235: the listener of an id stays until the release of the operation, after the frames of the same read.
      "fail | graphql-ws/client | completion of the peer | data | inbound | same read",
    ]);
  }, 120_000);
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
    const known = new Set([...targets, ...sessionTargets].map((one) => one.id));
    const missing = arm.arm.targets.filter((id) => !known.has(id));
    if (missing.length > 0) throw new Error(`The rig has no target "${missing.join('", "')}".`);
    const envelopes = await runProbe(targets.filter((one) => arm.arm.targets.includes(one.id)));
    const sessions = await runSessionProbe(sessionTargets.filter((one) => arm.arm.targets.includes(one.id)));
    writeReport([...envelopes, ...sessions], `arm-${arm.arm.id}-${arm.kind}`);
    const fails = [...failLines(envelopes), ...sessionLines(sessions)];
    if (arm.kind === "base") expect(fails).not.toEqual([]);
    else expect(fails).toEqual([]);
  }, 120_000);
});
