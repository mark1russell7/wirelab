/**
 * The probe of the class C034 on the reply targets: the error code of a wire status is mapped wrong. A Connect unary
 * error has a JSON body. When the body is not an error object, the code comes from the HTTP status. A stream with no
 * end marker is a protocol error. The universal transports of `@connectrpc/connect` give the code of each case. The
 * cases of `pusher-js` send a first frame of the handshake, and the close code of the frame gives the action of the
 * client.
 */
import { concatBytes } from "../cuts.ts";
import { envelope, stringValue } from "../targets/connect-web.ts";
import { GRAPHQL_ERRORS, graphqlQueryTargetIds } from "../targets/graphql-over-http.ts";
import type { Outcome, Verdict } from "../outcome.ts";
import type { ReplyTarget } from "../targets/target.ts";
import { expectCode, runReplyCases, type ReplyCase, type ReplyResult } from "./replies.ts";

/** The id of the class of this probe. */
export const CLASS_ID = "C034";

/**
 * The HTTP statuses of the unary cases, with the dimension value and the code of the HTTP status. The codes come from
 * the table "HTTP to Error Code" of the Connect protocol.
 */
const STATUSES: readonly (readonly [number, string, string])[] = [
  [400, "HTTP 400", "Internal"],
  [422, "HTTP 422", "Unknown"],
  [503, "HTTP 503", "Unavailable"],
];

/** One error body of a unary case. */
interface Body {
  /** The value of the dimension `body`. */
  readonly name: string;
  /** The content type of the response. */
  readonly contentType: string;
  /** The text of the body. */
  readonly text: string;
  /** The code of the error in the body. It is undefined when the code comes from the HTTP status. */
  readonly code?: string;
  /** A valid error body of the Connect protocol is a control. */
  readonly control?: boolean;
}

/** The error bodies of the unary cases. */
const BODIES: readonly Body[] = [
  { name: "spec JSON", contentType: "application/json", text: JSON.stringify({ code: "not_found", message: "gone" }), code: "NotFound", control: true },
  { name: "not JSON", contentType: "application/json", text: "Too Many Requests" },
  { name: "HTML page", contentType: "text/html", text: "<html><body>Bad Gateway</body></html>" },
  { name: "empty", contentType: "application/json", text: "" },
];

/** The stream targets, with their content type and the code of the universal transport for a stream with no end marker. */
const STREAMS: readonly (readonly [string, string, string])[] = [
  ["connect-web/connect-stream", "application/connect+proto", "InvalidArgument"],
  ["connect-web/grpc-web-stream", "application/grpc-web+proto", "Internal"],
];

/** The media type of a GraphQL response, with its charset. */
const GRAPHQL_RESPONSE = "application/graphql-response+json; charset=utf-8";

/** A GraphQL result with one request error and no data. */
const REQUEST_ERROR = JSON.stringify({ errors: [{ message: "real failure" }] });

/**
 * This function gives the GraphQL cases. A reply 400 or 422 of `application/graphql-response+json` holds the GraphQL
 * errors, so the caller must get them. A batch reply with an error in one item must give that error too.
 */
function graphqlCases(): ReplyCase[] {
  const shared = { class: CLASS_ID, expected: "the GraphQL errors", judge: expectCode(GRAPHQL_ERRORS) };
  const out: ReplyCase[] = [];
  for (const target of graphqlQueryTargetIds) {
    for (const status of [400, 422]) {
      out.push({
        ...shared,
        target,
        dims: { body: "spec JSON", status: `HTTP ${String(status)}` },
        detail: `HTTP ${String(status)} of application/graphql-response+json with one GraphQL error`,
        reply: { status, fields: { "content-type": GRAPHQL_RESPONSE }, body: REQUEST_ERROR },
      });
    }
    out.push({
      ...shared,
      target,
      dims: {},
      detail: "HTTP 200 with one GraphQL error",
      control: true,
      reply: { status: 200, fields: { "content-type": GRAPHQL_RESPONSE }, body: REQUEST_ERROR },
    });
  }
  out.push({
    ...shared,
    target: "graphql-request/batch",
    dims: { body: "spec JSON", status: "batch with errors" },
    detail: "HTTP 200 with a batch of 2 results, and one GraphQL error in the second",
    reply: { status: 200, fields: { "content-type": "application/json" }, body: JSON.stringify([{ data: { a: 1 } }, { data: null, errors: [{ message: "real failure" }] }]) },
  });
  return out;
}

/**
 * This function gives a judge of a session of `pusher-js`. The judge passes a session that ends in `state` with no
 * error out of a socket event. When `again` is true, the client must connect again after the first frame.
 */
export function expectSession(state: string, again: boolean): (outcome: Outcome) => Verdict {
  return (outcome) => {
    if (outcome.kind === "timeout") return "inconclusive";
    if (outcome.kind !== "value" || outcome.values.some((value) => value.startsWith("uncaught="))) return "fail";
    const connections = Number(outcome.values.find((value) => value.startsWith("connections="))?.slice("connections=".length));
    return outcome.values.includes(`state=${state}`) && connections > 1 === again ? "pass" : "fail";
  };
}

/** This function gives a frame `pusher:error` with `code`. */
const pusherError = (code: number | null): string => JSON.stringify({ event: "pusher:error", data: { code, message: "Something went wrong" } });

/**
 * The first frames of the handshake cases of `pusher-js`. A code of 4000 to 4099 refuses the connection, and the
 * client does not connect again. A code of 4100 to 4199 backs off, 4200 to 4299 retries, and 1002 to 1004 back off.
 * Another code below 4000, and a null code, back off, as for a close of the socket. An invalid handshake is not a
 * refusal, so the client connects again.
 */
const PUSHER_FRAMES: readonly (readonly [string, string | undefined, string, boolean])[] = [
  ["the code 4001", undefined, pusherError(4001), false],
  ["the code 4100", undefined, pusherError(4100), true],
  ["the code 4200", undefined, pusherError(4200), true],
  ["the code 1002", undefined, pusherError(1002), true],
  ["the unknown code 4300", undefined, pusherError(4300), false],
  ["a null code", "null code", pusherError(null), true],
  ["the code 1006", "code below 4000", pusherError(1006), true],
  ["the code 99", "unknown code 99", pusherError(99), true],
  ["no activity timeout", "invalid handshake", JSON.stringify({ event: "pusher:connection_established", data: JSON.stringify({ socket_id: "1.1" }) }), true],
  ["a frame that is not JSON", "invalid handshake", "Bad Gateway", true],
  ["an event that is not of the handshake", "invalid handshake", JSON.stringify({ event: "pusher:ping", data: {} }), true],
];

/** This function gives the handshake cases of `pusher-js`, and a control with a valid handshake. */
function pusherCases(): ReplyCase[] {
  const out: ReplyCase[] = PUSHER_FRAMES.map(([name, status, frame, again]) => ({
    class: CLASS_ID,
    target: "pusher-js/handshake",
    dims: status === undefined ? {} : { status },
    ...(status === undefined ? { control: true } : {}),
    detail: `a first frame pusher:error or handshake with ${name}`,
    reply: { status: 101, body: frame },
    expected: again ? "the client connects again" : "the client stays disconnected",
    judge: again ? expectSession("connected", true) : expectSession("disconnected", false),
  }));
  out.push({
    class: CLASS_ID,
    target: "pusher-js/handshake",
    dims: {},
    control: true,
    detail: "a valid handshake as the first frame",
    reply: { status: 101, body: JSON.stringify({ event: "pusher:connection_established", data: JSON.stringify({ socket_id: "1.1", activity_timeout: 120 }) }) },
    expected: "the client connects",
    judge: expectSession("connected", false),
  });
  return out;
}

/** This function gives each case of the probe: each body with each status, and each stream with no end marker. */
export function cases(): ReplyCase[] {
  const out: ReplyCase[] = [];
  for (const body of BODIES) {
    for (const [status, statusName, statusCode] of STATUSES) {
      const code = body.code ?? statusCode;
      out.push({
        class: CLASS_ID,
        target: "connect-web/connect-unary",
        dims: { body: body.name, status: statusName },
        ...(body.control === true ? { control: true } : {}),
        detail: `unary HTTP ${status}, ${body.contentType}, body ${JSON.stringify(body.text.slice(0, 30))}`,
        reply: { status, fields: { "content-type": body.contentType }, body: body.text },
        expected: `error ${code}`,
        judge: expectCode(code),
      });
    }
  }
  for (const [target, contentType, code] of STREAMS) {
    out.push({
      class: CLASS_ID,
      target,
      dims: { status: "stream with no end marker" },
      detail: "2 data frames and no end marker",
      reply: {
        status: 200,
        fields: { "content-type": contentType },
        body: concatBytes([envelope(0, stringValue("a")).bytes, envelope(0, stringValue("b")).bytes]),
      },
      expected: `error ${code}`,
      judge: expectCode(code),
    });
  }
  return [...out, ...graphqlCases(), ...pusherCases()];
}

/** This function starts the probe on `targets` and gives each result. */
export function runProbe(targets: readonly ReplyTarget[]): Promise<ReplyResult[]> {
  return runReplyCases(cases(), targets);
}
