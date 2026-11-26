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
export type ReplyProtocol = "connect" | "grpc-web";

/** The kinds of call of a reply target. */
export type CallKind = "unary" | "stream";

/**
 * A target that takes one whole HTTP response: the status, the fields and the body. The probes of the error classes
 * use it, because an error of these protocols is in the status, the fields or the trailers.
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
