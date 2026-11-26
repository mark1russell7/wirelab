/**
 * A target binds the rig to one client of one package. The rig gives a target the bytes of a hostile peer, and the
 * target gives the outcome that the caller of the client sees.
 */
import type { FramedStream } from "../cuts.ts";
import type { Outcome } from "../outcome.ts";

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
  /** This function sends `bytes` to the client as one whole response and gives the outcome of the call. */
  run(bytes: Uint8Array): Promise<Outcome>;
}
