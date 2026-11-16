// The codec of the tests comes from the protocol document. These tests compare it with the examples of the document.
import { describe, expect, it } from "vitest";
import { decodePacket, decodePayload, encodePacket, encodePayload, openPacket, PACKET_TYPES } from "./codec.ts";

describe("the codec", () => {
  it("gives the numbers 0 to 6 to the packet types", () => {
    expect(PACKET_TYPES).toEqual(["open", "close", "ping", "pong", "message", "upgrade", "noop"]);
  });

  it("encodes the examples of the protocol document", () => {
    expect(encodePacket({ type: "message", data: "hello" })).toBe("4hello");
    expect(encodePacket({ type: "message", data: new Uint8Array([1, 2, 3, 4]) })).toBe("bAQIDBA==");
    expect(encodePacket({ type: "ping", data: "" })).toBe("2");
    expect(encodePayload([
      { type: "message", data: "hello" },
      { type: "message", data: new Uint8Array([1, 2, 3, 4]) },
    ])).toBe("4hello\x1ebAQIDBA==");
  });

  it("decodes each packet of a payload", () => {
    expect(decodePayload("4hello\x1ebAQIDBA==\x1e2")).toEqual([
      { type: "message", data: "hello" },
      { type: "message", data: new Uint8Array([1, 2, 3, 4]) },
      { type: "ping", data: "" },
    ]);
  });

  it("gives undefined for a text that is not a packet", () => {
    expect(decodePacket("")).toBeUndefined();
    expect(decodePacket("7")).toBeUndefined();
    expect(decodePacket("x")).toBeUndefined();
    expect(decodePacket("b!!")).toBeUndefined();
  });

  it("refuses binary data in a packet that is not a message", () => {
    expect(() => encodePacket({ type: "ping", data: new Uint8Array([1]) })).toThrow(RangeError);
  });

  it("encodes the open packet as JSON", () => {
    const handshake = { sid: "a", upgrades: [], pingInterval: 1, pingTimeout: 2, maxPayload: 3 };
    expect(openPacket(handshake)).toEqual({ type: "open", data: JSON.stringify(handshake) });
  });
});
