/**
 * The probe of the class C033 on the reply targets: a failure status, or an empty or non-object error body, becomes a
 * success. Each case sends a failure. The caller must get an error.
 */
import { concatBytes } from "../cuts.ts";
import { envelope, grpcWebTrailer, stringValue } from "../targets/connect-web.ts";
import type { ReplyTarget } from "../targets/target.ts";
import { expectCode, expectError, runReplyCases, type ReplyCase, type ReplyResult } from "./replies.ts";

/** The id of the class of this probe. */
export const CLASS_ID = "C033";

/** The content type of a binary gRPC-web response. */
const GRPC_WEB = "application/grpc-web+proto";

/**
 * The binary status `google.rpc.Status { code: 0, message: "x" }` in base64: the field 2 (`0x12`) with the length 1.
 * The code 0 is the default, so the encoding has no field 1.
 */
const DETAILS_CODE_0 = Buffer.from([0x12, 0x01, 0x78]).toString("base64");

/** The fields of the status 13 with the details of the code 0. */
const STATUS_13_DETAILS_0 = { "grpc-status": "13", "grpc-message": "real failure", "grpc-status-details-bin": DETAILS_CODE_0 };

/** The error bodies of a Connect unary call that are not an object. Each is a value of the dimension `body`. */
const BODIES: readonly (readonly [string, string])[] = [
  ["empty", ""],
  ["null", "null"],
  ["false", "false"],
  ["0", "0"],
  ['""', '""'],
];

/** This function gives the 3 gRPC-web cases of one target: the 2 places of the details, and the control. */
function grpcWebCases(target: string): ReplyCase[] {
  const details = { status: "grpc-status 13 with details code 0" };
  const shared = { class: CLASS_ID, target, expected: "error Internal", judge: expectCode("Internal") };
  return [
    {
      ...shared,
      dims: details,
      detail: "trailer frame: grpc-status 13, grpc-status-details-bin with the code 0",
      reply: {
        status: 200,
        fields: { "content-type": GRPC_WEB },
        body: concatBytes([envelope(0, stringValue("a")).bytes, grpcWebTrailer(STATUS_13_DETAILS_0)]),
      },
    },
    {
      ...shared,
      dims: details,
      detail: "trailers-only headers: grpc-status 13, grpc-status-details-bin with the code 0",
      reply: { status: 200, fields: { "content-type": GRPC_WEB, ...STATUS_13_DETAILS_0 } },
    },
    {
      ...shared,
      dims: {},
      detail: "trailer frame: grpc-status 13 with no details",
      control: true,
      reply: {
        status: 200,
        fields: { "content-type": GRPC_WEB },
        body: concatBytes([envelope(0, stringValue("a")).bytes, grpcWebTrailer({ "grpc-status": "13", "grpc-message": "real failure" })]),
      },
    },
  ];
}

/** This function gives each case of the probe. */
export function cases(): ReplyCase[] {
  const out: ReplyCase[] = [...grpcWebCases("connect-web/grpc-web-unary"), ...grpcWebCases("connect-web/grpc-web-stream")];
  out.push({
    class: CLASS_ID,
    target: "connect-web/grpc-web-unary",
    dims: { status: "200 with empty body", body: "empty" },
    detail: "HTTP 200 with an empty body and no grpc-status",
    reply: { status: 200, fields: { "content-type": GRPC_WEB } },
    expected: "an error",
    judge: expectError(),
  });
  for (const [body, text] of BODIES) {
    out.push({
      class: CLASS_ID,
      target: "connect-web/connect-unary",
      dims: { status: "500", body },
      detail: `HTTP 500 with the JSON error body ${JSON.stringify(text)}`,
      reply: { status: 500, fields: { "content-type": "application/json" }, body: text },
      expected: "an error",
      judge: expectError(),
    });
  }
  return out;
}

/** This function starts the probe on `targets` and gives each result. */
export function runProbe(targets: readonly ReplyTarget[]): Promise<ReplyResult[]> {
  return runReplyCases(cases(), targets);
}
