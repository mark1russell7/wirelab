import { describe, expect, it } from "vitest";
import { CUTS, PLACES, concatBytes, cutCases, cutCasesAt, fieldBoundaries, keptBytes, type Frame } from "./cuts.ts";

/** This function gives a frame with a prefix of `prefix` bytes and a payload of `payload` bytes. */
const frame = (prefix: number, payload: number, fill: number, fields?: readonly number[]): Frame => ({
  bytes: new Uint8Array(prefix + payload).fill(fill),
  prefix,
  ...(fields === undefined ? {} : { fields }),
});

describe("keptBytes", () => {
  it("gives each cut point of a frame with a 5-byte prefix and a 4-byte payload", () => {
    const one = frame(5, 4, 1);
    expect(CUTS.map((cut) => keptBytes(one, cut))).toEqual([[1], [4], [5], [7], []]);
  });

  it("gives no point that is the same as an earlier point, or that the frame does not have", () => {
    expect(CUTS.map((cut) => keptBytes(frame(2, 0, 1), cut))).toEqual([[1], [], [], [], []]);
    expect(CUTS.map((cut) => keptBytes(frame(1, 1, 1), cut))).toEqual([[], [], [1], [], []]);
  });

  it("gives each boundary between two fields of the prefix that no earlier cut has", () => {
    // Arrow: the continuation marker and the length. The boundary at 4 is a new point.
    expect(keptBytes(frame(8, 4, 1, [4, 4]), "at a field boundary of the prefix")).toEqual([4]);
    // A prelude of three 4-byte fields has two boundaries.
    expect(keptBytes(frame(12, 4, 1, [4, 4, 4]), "at a field boundary of the prefix")).toEqual([4, 8]);
    // Connect: the flags byte and the length. The boundary at 1 is the point of `1 byte into the prefix`.
    expect(keptBytes(frame(5, 4, 1, [1, 4]), "at a field boundary of the prefix")).toEqual([]);
  });
});

describe("fieldBoundaries", () => {
  it("gives no boundary for a prefix of one field", () => {
    expect(fieldBoundaries(frame(4, 2, 1))).toEqual([]);
    expect(fieldBoundaries(frame(4, 2, 1, [4]))).toEqual([]);
  });

  it("refuses fields that do not fill the prefix", () => {
    expect(() => fieldBoundaries(frame(8, 2, 1, [4, 3]))).toThrow(/do not fill the prefix of 8 bytes/);
    expect(() => fieldBoundaries(frame(4, 2, 1, [4, 0]))).toThrow(/do not fill/);
  });
});

describe("cutCasesAt", () => {
  const stream = { frames: [frame(5, 2, 1), frame(5, 2, 2), frame(5, 2, 3)] };

  it("keeps the frames before the cut frame and the first bytes of the cut frame", () => {
    const [middle] = cutCasesAt(stream, "middle", "1 byte into the prefix");
    expect(middle?.frame).toBe(1);
    expect(Array.from(middle?.bytes ?? [])).toEqual([1, 1, 1, 1, 1, 1, 1, 2]);
    const [first] = cutCasesAt(stream, "first", "inside the payload");
    expect(Array.from(first?.bytes ?? [])).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("adds a part of a copy of the first frame after the whole stream for `after the end marker`", () => {
    const [after] = cutCasesAt(stream, "after the end marker", "after the full prefix with 0 payload bytes");
    expect(after?.frame).toBe(3);
    expect(after?.bytes).toEqual(concatBytes([...stream.frames.map((one) => one.bytes), new Uint8Array(5).fill(1)]));
  });

  it("gives one cut stream for each field boundary", () => {
    const prelude = { frames: [frame(12, 2, 1, [4, 4, 4])] };
    expect(cutCasesAt(prelude, "first", "at a field boundary of the prefix").map((one) => one.keep)).toEqual([4, 8]);
  });

  it("has no middle frame in a stream of fewer than 3 frames, and no cut in an empty stream", () => {
    expect(cutCasesAt({ frames: stream.frames.slice(0, 2) }, "middle", "1 byte into the prefix")).toEqual([]);
    expect(cutCases({ frames: [] })).toEqual([]);
  });

  it("gives each place and each cut of a stream with long frames", () => {
    // The prefix of these frames has one field, so the cut at a field boundary has no point.
    expect(cutCases(stream)).toHaveLength(PLACES.length * (CUTS.length - 1));
    const arrow = { frames: [0, 1, 2].map((fill) => frame(8, 4, fill, [4, 4])) };
    expect(cutCases(arrow)).toHaveLength(PLACES.length * CUTS.length);
  });
});
