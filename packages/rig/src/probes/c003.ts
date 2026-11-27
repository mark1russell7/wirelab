/**
 * The probe of the class C003 on the reply targets: the error that the caller gets is not the real cause. A gRPC-web
 * status message is percent-encoded. A client decodes it, and a bad escape must not replace the status of the wire.
 * Each case sends a status code and a message with a bad escape. The caller must get the code of the wire.
 *
 * The cause cases use the oracle of the catalog on the cause targets. The error of the trigger has the class and the
 * code of the error of the reference. The reference is the same failure in a form that the client reports well.
 */
import type { ScriptedReply } from "@mark1russell7/rigor-testkit/http";
import { concatBytes } from "../cuts.ts";
import { outcomeText, type Outcome, type Verdict } from "../outcome.ts";
import { envelope, grpcWebTrailer, stringValue } from "../targets/connect-web.ts";
import type { CauseTarget, ReplyTarget } from "../targets/target.ts";
import { expectCode, runReplyCases, type ReplyCase, type ReplyResult } from "./replies.ts";

/** The id of the class of this probe. */
export const CLASS_ID = "C003";

/** The content type of a binary gRPC-web response. */
const GRPC_WEB = "application/grpc-web+proto";

/** The gRPC-web targets of the probe. */
const TARGETS = ["connect-web/grpc-web-unary", "connect-web/grpc-web-stream"] as const;

/** One place of a status message in a gRPC-web response. */
interface Place {
  /** The place, in words. */
  readonly name: string;
  /** The state of the call when the client reads the message. It is a value of the catalog. */
  readonly state: string;
  /** The code that the caller must get. */
  readonly code: string;
  /** This function gives the response with the status message `message`. */
  readonly reply: (message: string) => ScriptedReply;
}

/** The places of a status message: the trailer frame, the headers of a trailers-only response and an HTTP error. */
const PLACES: readonly Place[] = [
  {
    name: "trailer frame, grpc-status 5",
    state: "after end",
    code: "NotFound",
    reply: (message) => ({
      status: 200,
      fields: { "content-type": GRPC_WEB },
      body: concatBytes([envelope(0, stringValue("a")).bytes, grpcWebTrailer({ "grpc-status": "5", "grpc-message": message })]),
    }),
  },
  {
    name: "trailers-only headers, grpc-status 14",
    state: "open",
    code: "Unavailable",
    reply: (message) => ({ status: 200, fields: { "content-type": GRPC_WEB, "grpc-status": "14", "grpc-message": message } }),
  },
  {
    name: "HTTP 503",
    state: "open",
    code: "Unavailable",
    reply: (message) => ({ status: 503, fields: { "content-type": GRPC_WEB, "grpc-message": message } }),
  },
];

/** The status messages with a bad escape: a `%` with no hex digits, and a lone lead byte of UTF-8. */
const BAD_MESSAGES = ["50% off", "bad %E2 byte"] as const;

/** The status message of the control cases: a valid escape. */
const CONTROL_MESSAGE = "not%20found";

/** This function gives each case of the probe: each place with each bad message on each target, and the controls. */
export function cases(): ReplyCase[] {
  const out: ReplyCase[] = [];
  for (const target of TARGETS) {
    const control = PLACES[0];
    if (control !== undefined) {
      out.push({
        class: CLASS_ID,
        target,
        dims: {},
        detail: `${control.name}, grpc-message "${CONTROL_MESSAGE}"`,
        control: true,
        reply: control.reply(CONTROL_MESSAGE),
        expected: `error ${control.code}`,
        judge: expectCode(control.code),
      });
    }
    for (const place of PLACES) {
      for (const message of BAD_MESSAGES) {
        out.push({
          class: CLASS_ID,
          target,
          dims: { state: place.state, step: "percent-decode of a status message" },
          detail: `${place.name}, grpc-message "${message}"`,
          reply: place.reply(message),
          expected: `error ${place.code}`,
          judge: expectCode(place.code),
        });
      }
    }
  }
  return out;
}

/** This function starts the probe on `targets` and gives each result. */
export function runProbe(targets: readonly ReplyTarget[]): Promise<ReplyResult[]> {
  return runReplyCases(cases(), targets);
}

/** One cause case: a target, the values of the dimensions, and the input that the probe compares with the reference. */
export interface CauseCase {
  readonly class: string;
  readonly target: string;
  readonly dims: Readonly<Record<string, string>>;
  readonly detail: string;
  /** A control case compares the reference with itself. A fail of a control shows that the target does not give the same outcome twice. */
  readonly control?: boolean;
}

/** This function gives each cause case of `targets`: a control and the trigger of each target. */
export function causeCases(targets: readonly CauseTarget[]): CauseCase[] {
  return targets.flatMap((target): CauseCase[] => [
    { class: CLASS_ID, target: target.id, dims: {}, detail: `control: ${target.reference}`, control: true },
    { class: CLASS_ID, target: target.id, dims: { state: target.state, step: target.step }, detail: target.trigger },
  ]);
}

/** This function gives the shape of `outcome` that the oracle of C003 compares: the kind, and the class and the code of an error. */
export function causeShape(outcome: Outcome): string {
  if (outcome.kind !== "error") return outcome.kind;
  return outcome.code === "" ? `error ${outcome.name}` : `error ${outcome.name} ${outcome.code}`;
}

/** This function is the oracle of C003: the two outcomes have the same shape. A timeout is inconclusive. */
export function sameCause(outcome: Outcome, reference: Outcome): Verdict {
  if (outcome.kind === "timeout" || reference.kind === "timeout") return "inconclusive";
  return causeShape(outcome) === causeShape(reference) ? "pass" : "fail";
}

/** This function starts each cause case on its target, one run at a time, and gives each result. */
export async function runCauseProbe(targets: readonly CauseTarget[], cases: readonly CauseCase[] = causeCases(targets)): Promise<ReplyResult[]> {
  const results: ReplyResult[] = [];
  for (const one of cases) {
    const target = targets.find((candidate) => candidate.id === one.target);
    if (target === undefined) continue;
    const reference = await target.run("reference");
    const outcome = await target.run(one.control === true ? "reference" : "trigger");
    results.push({
      class: one.class,
      target: target.id,
      package: target.package,
      version: target.version,
      detail: one.detail,
      control: one.control === true,
      expected: `${causeShape(reference)}, as the reference (${target.reference}): ${outcomeText(reference)}`,
      verdict: sameCause(outcome, reference),
      outcome: outcomeText(outcome),
    });
  }
  return results;
}
