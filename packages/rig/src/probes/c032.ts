/**
 * The probe of the class C032 on the reply targets: the result reported to the caller differs from what happened on
 * the wire. A server stream gives its trailers to the caller. In a trailers-only response of gRPC-web, the trailers
 * are the headers. Each case sends the trailer `x-trailer-meta: v1`. The caller must get it in the trailers. The universal
 * gRPC-web transport of `@connectrpc/connect` 2.3.0 also gives no trailers for a trailers-only response.
 */
import { concatBytes } from "../cuts.ts";
import { connectEndStream, envelope, grpcWebTrailer, stringValue } from "../targets/connect-web.ts";
import type { ReplyTarget } from "../targets/target.ts";
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
