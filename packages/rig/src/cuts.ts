/**
 * The adapter of the format `length-prefixed-envelope`. A target gives a valid stream as a list of frames. Each frame
 * starts with a prefix that declares the length of its payload. This adapter makes the cut streams of the class C017:
 * the valid stream, cut at one point inside one frame. A cut stream is not complete, so a correct client raises an
 * error for each one.
 */

/** One frame of a valid stream: its bytes, and the width of its prefix in bytes. */
export interface Frame {
  readonly bytes: Uint8Array;
  /** The bytes of the prefix: the length and the flags, before the payload. It is 1 or more. */
  readonly prefix: number;
  /**
   * The widths of the fields of the prefix, in their order, for example the flags and the length. Their sum is
   * `prefix`. No value means that the prefix has one field.
   */
  readonly fields?: readonly number[];
}

/** A valid stream of a protocol. The last frame is the end marker when the protocol has one. */
export interface FramedStream {
  readonly frames: readonly Frame[];
}

/** These are the cut points inside a frame. They are the values of the dimension `cut` of C017. */
export const CUTS = [
  "1 byte into the prefix",
  "prefix width - 1",
  "after the full prefix with 0 payload bytes",
  "inside the payload",
  "at a field boundary of the prefix",
] as const;

/** A cut point inside a frame. */
export type Cut = (typeof CUTS)[number];

/** These are the frames that a cut can go into. They are the values of the dimension `frame` of C017. */
export const PLACES = ["first", "middle", "after the end marker"] as const;

/** The frame that a cut goes into. `after the end marker` adds a part of a frame after the whole valid stream. */
export type Place = (typeof PLACES)[number];

/** One cut stream. */
export interface CutCase {
  readonly place: Place;
  readonly cut: Cut;
  /** The index of the cut frame. For `after the end marker`, it is the count of the frames of the valid stream. */
  readonly frame: number;
  /** The bytes of the cut frame that the stream keeps. */
  readonly keep: number;
  /** The bytes of the cut stream. */
  readonly bytes: Uint8Array;
}

/** This function gives the one point of a cut that is not `at a field boundary of the prefix`, or `undefined`. */
function onePoint(frame: Frame, cut: Exclude<Cut, "at a field boundary of the prefix">): number | undefined {
  const payload = frame.bytes.length - frame.prefix;
  switch (cut) {
    case "1 byte into the prefix":
      return frame.prefix > 1 ? 1 : undefined;
    case "prefix width - 1":
      return frame.prefix > 2 ? frame.prefix - 1 : undefined;
    case "after the full prefix with 0 payload bytes":
      return payload > 0 ? frame.prefix : undefined;
    case "inside the payload":
      return payload > 1 ? frame.prefix + Math.max(1, Math.floor(payload / 2)) : undefined;
  }
}

/** This function gives each boundary between two fields of the prefix of `frame`, as a count of bytes. */
export function fieldBoundaries(frame: Frame): number[] {
  const fields = frame.fields ?? [frame.prefix];
  const sum = fields.reduce((total, width) => total + width, 0);
  if (fields.some((width) => !Number.isInteger(width) || width < 1) || sum !== frame.prefix) {
    throw new Error(`The fields ${JSON.stringify(fields)} do not fill the prefix of ${frame.prefix} bytes.`);
  }
  const out: number[] = [];
  let at = 0;
  for (const width of fields.slice(0, -1)) out.push((at += width));
  return out;
}

/**
 * This function gives each count of the bytes of `frame` that a cut at `cut` keeps. The cut
 * `at a field boundary of the prefix` gives one count for each boundary. The list is empty when the frame has no
 * such point. The list has no point of an earlier cut of `CUTS`.
 */
export function keptBytes(frame: Frame, cut: Cut): number[] {
  const earlier = new Set<number>();
  for (const one of CUTS) {
    if (one === cut) break;
    for (const point of keptBytes(frame, one)) earlier.add(point);
  }
  const points = cut === "at a field boundary of the prefix" ? fieldBoundaries(frame) : [onePoint(frame, cut)];
  return points.filter((point): point is number => point !== undefined && !earlier.has(point));
}

/** This function joins byte arrays into one array. */
export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** This function gives the index of the frame of `place`, or `undefined` when the stream has no such frame. */
function frameIndex(stream: FramedStream, place: Place): number | undefined {
  const count = stream.frames.length;
  if (place === "first") return count > 0 ? 0 : undefined;
  if (place === "middle") return count >= 3 ? Math.floor(count / 2) : undefined;
  return count > 0 ? count : undefined;
}

/**
 * This function gives the cut streams of `place` and `cut`: one for each point of `keptBytes`. The list is empty
 * when `stream` has no such cut.
 * - For `first` and `middle`, the stream keeps the frames before the cut frame and the first bytes of the cut frame.
 * - For `after the end marker`, the stream keeps each frame, and then the first bytes of a copy of the first frame.
 */
export function cutCasesAt(stream: FramedStream, place: Place, cut: Cut): CutCase[] {
  const index = frameIndex(stream, place);
  if (index === undefined) return [];
  const whole = stream.frames.map((frame) => frame.bytes);
  const cutFrame = place === "after the end marker" ? stream.frames[0] : stream.frames[index];
  if (cutFrame === undefined) return [];
  return keptBytes(cutFrame, cut).map((keep) => ({
    place,
    cut,
    frame: index,
    keep,
    bytes: concatBytes([...whole.slice(0, index), cutFrame.bytes.subarray(0, keep)]),
  }));
}

/** This function gives each cut stream of `stream`, in the order of `PLACES` and then `CUTS`. */
export function cutCases(stream: FramedStream, places: readonly Place[] = PLACES, cuts: readonly Cut[] = CUTS): CutCase[] {
  const out: CutCase[] = [];
  for (const place of places) {
    for (const cut of cuts) out.push(...cutCasesAt(stream, place, cut));
  }
  return out;
}
