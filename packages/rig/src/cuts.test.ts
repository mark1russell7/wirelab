import { describe, expect, it } from "vitest";
import { CUTS, PLACES, concatBytes, cutCase, cutCases, keptBytes, type Frame } from "./cuts.ts";

/** This function gives a frame with a prefix of `prefix` bytes and a payload of `payload` bytes. */
const frame = (prefix: number, payload: number, fill: number): Frame => ({
  bytes: new Uint8Array(prefix + payload).fill(fill),
  prefix,
});

describe("keptBytes", () => {
  it("gives each cut point of a frame with a 5-byte prefix and a 4-byte payload", () => {
    const one = frame(5, 4, 1);
    expect(CUTS.map((cut) => keptBytes(one, cut))).toEqual([1, 4, 5, 7]);
  });

  it("gives no point that is the same as an earlier point, or that the frame does not have", () => {
    expect(CUTS.map((cut) => keptBytes(frame(2, 0, 1), cut))).toEqual([1, undefined, undefined, undefined]);
    expect(CUTS.map((cut) => keptBytes(frame(1, 1, 1), cut))).toEqual([undefined, undefined, 1, undefined]);
  });
});

describe("cutCase", () => {
  const stream = { frames: [frame(5, 2, 1), frame(5, 2, 2), frame(5, 2, 3)] };

  it("keeps the frames before the cut frame and the first bytes of the cut frame", () => {
    const middle = cutCase(stream, "middle", "1 byte into the prefix");
    expect(middle?.frame).toBe(1);
    expect(Array.from(middle?.bytes ?? [])).toEqual([1, 1, 1, 1, 1, 1, 1, 2]);
    const first = cutCase(stream, "first", "inside the payload");
    expect(Array.from(first?.bytes ?? [])).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("adds a part of a copy of the first frame after the whole stream for `after the end marker`", () => {
    const after = cutCase(stream, "after the end marker", "after the full prefix with 0 payload bytes");
    expect(after?.frame).toBe(3);
    expect(after?.bytes).toEqual(concatBytes([...stream.frames.map((one) => one.bytes), new Uint8Array(5).fill(1)]));
  });

  it("has no middle frame in a stream of fewer than 3 frames, and no cut in an empty stream", () => {
    expect(cutCase({ frames: stream.frames.slice(0, 2) }, "middle", "1 byte into the prefix")).toBeUndefined();
    expect(cutCases({ frames: [] })).toEqual([]);
  });

  it("gives each place and each cut of a stream with long frames", () => {
    expect(cutCases(stream)).toHaveLength(PLACES.length * CUTS.length);
  });
});
