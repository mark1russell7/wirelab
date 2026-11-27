/**
 * The probe of the class C032 on the reply targets: the result reported to the caller differs from what happened on
 * the wire. A server stream gives its trailers to the caller. In a trailers-only response of gRPC-web, the trailers
 * are the headers. Each case sends the trailer `x-trailer-meta: v1`. The caller must get it in the trailers. The universal
 * gRPC-web transport of `@connectrpc/connect` 2.3.0 also gives no trailers for a trailers-only response.
 *
 * The wire targets examine the other clients of the class. Each one gives the outcome of one call and the packets that the
 * peer got. The rule of the protocol for the reply of the peer gives the expected kind of the outcome and the packets.
 */
import { concatBytes } from "../cuts.ts";
import { connectEndStream, envelope, grpcWebTrailer, stringValue } from "../targets/connect-web.ts";
import { outcomeText, type Verdict } from "../outcome.ts";
import type { ReplyTarget, WireRule, WireRun, WireTarget } from "../targets/target.ts";
import { expectTrailer, runReplyCases, type ReplyCase, type ReplyResult } from "./replies.ts";

/** The id of the class of this probe. */
export const CLASS_ID = "C032";

/** The name of the trailer of each case. */
const NAME = "x-trailer-meta";

/** The value of the trailer of each case. */
const VALUE = "v1";

/** This function gives each case of the probe: the trailers-only response and the 2 controls. */
export function cases(): ReplyCase[] {
  const shared = { class: CLASS_ID, expected: `a value with the trailer ${NAME}: ${VALUE}`, judge: expectTrailer(NAME, VALUE) };
  return [
    {
      ...shared,
      target: "connect-web/connect-stream",
      dims: {},
      detail: `EndStreamResponse with the metadata ${NAME}`,
      control: true,
      reply: {
        status: 200,
        fields: { "content-type": "application/connect+proto" },
        body: concatBytes([envelope(0, stringValue("a")).bytes, connectEndStream({ metadata: { [NAME]: [VALUE] } })]),
      },
    },
    {
      ...shared,
      target: "connect-web/grpc-web-stream",
      dims: {},
      detail: `trailer frame with grpc-status 0 and ${NAME}`,
      control: true,
      reply: {
        status: 200,
        fields: { "content-type": "application/grpc-web+proto" },
        body: concatBytes([envelope(0, stringValue("a")).bytes, grpcWebTrailer({ "grpc-status": "0", [NAME]: VALUE })]),
      },
    },
    {
      ...shared,
      target: "connect-web/grpc-web-stream",
      dims: { call: "server stream", reply: "trailers-only response" },
      detail: `trailers-only response: the headers grpc-status 0 and ${NAME}, an empty body`,
      reply: { status: 200, fields: { "content-type": "application/grpc-web+proto", "grpc-status": "0", [NAME]: VALUE } },
    },
  ];
}

/** This function starts the probe on `targets` and gives each result. */
export function runProbe(targets: readonly ReplyTarget[]): Promise<ReplyResult[]> {
  return runReplyCases(cases(), targets);
}

/** A case of a wire target: the reference as a control, or the trigger. */
export interface WireCase {
  readonly class: string;
  readonly target: string;
  readonly dims: Readonly<Record<string, string>>;
  readonly detail: string;
  /** A control case gives the reference. A fail of a control shows a fault of the rig, not of the target. */
  readonly control?: boolean;
}

/** This function gives each wire case of `targets`: a control and the trigger of each target. */
export function wireCases(targets: readonly WireTarget[]): WireCase[] {
  return targets.flatMap((target): WireCase[] => [
    { class: CLASS_ID, target: target.id, dims: {}, detail: `control: ${target.reference}`, control: true },
    { class: CLASS_ID, target: target.id, dims: { call: target.call, reply: target.reply }, detail: target.trigger },
  ]);
}

/** This function gives a rule or a run as text: the kind of the outcome or its text, and the packets. */
const wireText = (head: string, wire: readonly string[]): string => `${head}, wire ${JSON.stringify(wire)}`;

/**
 * This function is the oracle of C032 for a wire run: the kind of the outcome and the packets are equal to the rule. The
 * order of the packets is part of the rule. A timeout is inconclusive.
 */
export function wireVerdict(run: WireRun, rule: WireRule): Verdict {
  if (run.outcome.kind === "timeout") return "inconclusive";
  return run.outcome.kind === rule.kind && JSON.stringify(run.wire) === JSON.stringify(rule.wire) ? "pass" : "fail";
}

/** This function starts each wire case on its target, one run at a time, and gives each result. */
export async function runWireProbe(targets: readonly WireTarget[], cases: readonly WireCase[] = wireCases(targets)): Promise<ReplyResult[]> {
  const results: ReplyResult[] = [];
  for (const one of cases) {
    const target = targets.find((candidate) => candidate.id === one.target);
    if (target === undefined) continue;
    const input = one.control === true ? "reference" : "trigger";
    const rule = target.rule(input);
    const run = await target.run(input);
    results.push({
      class: one.class,
      target: target.id,
      package: target.package,
      version: target.version,
      detail: one.detail,
      control: one.control === true,
      expected: wireText(rule.kind, rule.wire),
      verdict: wireVerdict(run, rule),
      outcome: wireText(outcomeText(run.outcome), run.wire),
    });
  }
  return results;
}
