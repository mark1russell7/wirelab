/**
 * The probe of the class C003 on the reply targets: the error that the caller gets is not the real cause. A gRPC-web
 * status message is percent-encoded. A client decodes it, and a bad escape must not replace the status of the wire.
 * Each case sends a status code and a message with a bad escape. The caller must get the code of the wire.
 */
import type { ScriptedReply } from "@mark1russell7/rigor-testkit/http";
import { concatBytes } from "../cuts.ts";
import { envelope, grpcWebTrailer, stringValue } from "../targets/connect-web.ts";
import type { ReplyTarget } from "../targets/target.ts";
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
