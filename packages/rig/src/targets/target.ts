/**
 * A target binds the rig to one client of one package. The rig gives a target the bytes of a hostile peer, and the
 * target gives the outcome that the caller of the client sees.
 */
import type { ScriptedReply } from "@mark1russell7/rigor-testkit/http";
import type { FramedStream } from "../cuts.ts";
import type { Outcome } from "../outcome.ts";

/**
 * The rule of a protocol for a frame after its end marker. `refuse`: the client raises an error. `ignore`: the caller
 * gets the values of the valid stream, and the client drops the frame.
 */
export type AfterEndRule = "refuse" | "ignore";

/** A target of the format `length-prefixed-envelope`. */
export interface EnvelopeTarget {
  /** The id of the target: the package and the call, for example `connect-web/connect-stream`. */
  readonly id: string;
  /** The npm name of the package. */
  readonly package: string;
  /** The version of the package that the workspace installs. */
  readonly version: string;
  /** This function gives a valid stream of the protocol of the target. The last frame is the end marker when the protocol has one. */
  stream(): FramedStream;
  /**
   * The rule of the protocol for a frame after the end marker. No value means that the protocol has no end marker, or
   * no rule for a frame after it. The probe of C016 examines only a target with a rule.
   */
  readonly afterEnd?: AfterEndRule;
  /** This function sends `bytes` to the client as one whole response and gives the outcome of the call. */
  run(bytes: Uint8Array): Promise<Outcome>;
}

/** The protocols of a reply target. */
export type ReplyProtocol = "connect" | "grpc-web" | "graphql-over-http" | "json-rpc" | "postgrest" | "pusher";

/** The kinds of call of a reply target. */
export type CallKind = "unary" | "stream";

/**
 * A target that takes one whole HTTP response: the status, the fields and the body. The probes of the error classes
 * use it, because an error of these protocols is in the status, the fields or the trailers. A target of a WebSocket
 * protocol takes the body as the first frame of the server.
 */
export interface ReplyTarget {
  /** The id of the target: the package and the call, for example `connect-web/connect-unary`. */
  readonly id: string;
  /** The npm name of the package. */
  readonly package: string;
  /** The version of the package that the workspace installs. */
  readonly version: string;
  /** The protocol of the call. */
  readonly protocol: ReplyProtocol;
  /** The kind of the call. */
  readonly call: CallKind;
  /** This function sends `reply` to the client as the response of one call and gives the outcome of the call. */
  reply(reply: ScriptedReply): Promise<Outcome>;
}

/**
 * A target that puts one key into one table of a client: a name that comes from the peer or from the app. The probe of
 * C001 compares the outcome of a key of `Object.prototype` with the outcome of a random unknown key.
 */
export interface KeyTarget {
  /** The id of the target: the package and the table, for example `stompjs/receipt`. */
  readonly id: string;
  /** The npm name of the package. */
  readonly package: string;
  /** The version of the package that the workspace installs. */
  readonly version: string;
  /** The table of the key: a value of the dimension `table` of C001. */
  readonly table: string;
  /** The phase of the key: a value of the dimension `phase` of C001. */
  readonly phase: string;
  /** This function puts `key` into the table, operates the client and gives the outcome. */
  run(key: string): Promise<Outcome>;
}

/**
 * The two inputs of a cause target. `reference`: a failure that the client reports with its real cause. `trigger`: the
 * same failure in the form of the finding.
 */
export type CauseInput = "reference" | "trigger";

/**
 * A target that makes one failure of a client in two forms. The probe of C003 compares the error of the trigger with
 * the error of the reference. The class and the code of the two errors must be equal.
 */
export interface CauseTarget {
  /** The id of the target: the package and the failure, for example `mqtt/end-before-connect`. */
  readonly id: string;
  /** The npm name of the package. */
  readonly package: string;
  /** The version of the package that the workspace installs. */
  readonly version: string;
  /** The state of the client at the failure: a value of the dimension `state` of C003. */
  readonly state: string;
  /** The step that replaces the cause: a value of the dimension `step` of C003. */
  readonly step: string;
  /** The failure of the reference, in words. */
  readonly reference: string;
  /** The failure of the trigger, in words. */
  readonly trigger: string;
  /** This function makes the failure in the form `input` and gives the outcome that the caller sees. */
  run(input: CauseInput): Promise<Outcome>;
}

/** The kind of outcome that the rule of a protocol gives for one reply of the peer. */
export type ExpectedKind = "value" | "error";

/** The outcome of one run of a wire target, and the packets that the peer got. */
export interface WireRun {
  /** The outcome that the caller sees. */
  readonly outcome: Outcome;
  /** The packets of the peer that the target records, as short words, for example `subscribe a`. */
  readonly wire: readonly string[];
}

/** The result and the packets that the rule of a protocol gives for one reply of the peer. */
export interface WireRule {
  readonly kind: ExpectedKind;
  readonly wire: readonly string[];
}

/**
 * A target that compares the result that the caller gets with the packets on the wire. The probe of C032 starts the
 * reference and the trigger, and compares each run with the rule of the protocol for its reply.
 */
export interface WireTarget {
  /** The id of the target: the package and the call, for example `mqtt/unsuback-failure`. */
  readonly id: string;
  /** The npm name of the package. */
  readonly package: string;
  /** The version of the package that the workspace installs. */
  readonly version: string;
  /** The call of the case: a value of the dimension `call` of C032. */
  readonly call: string;
  /** The reply of the trigger: a value of the dimension `reply` of C032. */
  readonly reply: string;
  /** The reply of the reference, in words. The client handles it correctly. */
  readonly reference: string;
  /** The reply of the trigger, in words. */
  readonly trigger: string;
  /** This function gives the rule of the protocol for the reply `input`. */
  rule(input: CauseInput): WireRule;
  /** This function makes the peer send the reply `input`, and gives the outcome and the packets. */
  run(input: CauseInput): Promise<WireRun>;
}

/** The places of an end that a session target makes: the values of the dimension `after` of C016. */
export type SessionAfter = "end-of-stream frame" | "second end-of-stream" | "completion of the peer" | "local close()";

/** The kinds of the item after the end: the values of the dimension `frame` of C016. */
export type SessionFrame = "data" | "trailer" | "message batch";

/** The direction of the item after the end. `inbound`: from the peer to the caller. `outbound`: from the caller to the peer. */
export type Direction = "inbound" | "outbound";

/** One case of a session target: one end, and one item after it. */
export interface SessionCase {
  readonly after: SessionAfter;
  readonly frame: SessionFrame;
  readonly direction: Direction;
  /** A short text that tells this case from the other cases with the same values, for example the transport. */
  readonly variant: string;
}

/**
 * The record of one run of a session case. The target marks each item of the case after the end. Thus the record
 * tells the items of the valid session from the items after the end.
 */
export interface SessionRun {
  /**
   * The items of the valid session that crossed: to the caller for `inbound`, to the peer for `outbound`. A run with
   * no item here shows a fault of the rig, not of the client.
   */
  readonly before: readonly string[];
  /** The items after the end that crossed. The protocol lets no item cross after its end. */
  readonly after: readonly string[];
}

/**
 * A target of a session protocol: a client or a server that stays open, with a peer that the rig scripts. The probe of
 * C016 gives each case of the target, and the target starts the session and records the items.
 */
export interface SessionTarget {
  /** The id of the target: the package and the role, for example `graphql-ws/server`. */
  readonly id: string;
  /** The npm name of the package. */
  readonly package: string;
  /** The version of the package that the workspace installs. */
  readonly version: string;
  /** The format of the protocol in the catalog. */
  readonly format: "json-ws" | "text-frame-headers";
  /** The cases of the target, in order. */
  readonly cases: readonly SessionCase[];
  /** This function starts one case and gives its record. */
  run(one: SessionCase): Promise<SessionRun>;
}
