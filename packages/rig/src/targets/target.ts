/**
 * A target binds the rig to one client of one package. The rig gives a target the bytes of a hostile peer, and the
 * target gives the outcome that the caller of the client sees.
 */
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
