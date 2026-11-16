// The checks of the codec. The encoded texts are the examples of the section "Packet encoding" of the protocol document.
import { describe, expect, it } from "vitest";
import { decodeSioPacket, encodeSioPacket, placeholder, type SioPacket } from "./codec.ts";

const examples: readonly (readonly [string, SioPacket])[] = [
  ["0", { type: "CONNECT", nsp: "/" }],
  ['0/admin,{"sid":"oSO0OpakMV_3jnilAAAA"}', { type: "CONNECT", nsp: "/admin", data: { sid: "oSO0OpakMV_3jnilAAAA" } }],
  ['4{"message":"Not authorized"}', { type: "CONNECT_ERROR", nsp: "/", data: { message: "Not authorized" } }],
  ['2["foo"]', { type: "EVENT", nsp: "/", data: ["foo"] }],
  ['2/admin,["bar"]', { type: "EVENT", nsp: "/admin", data: ["bar"] }],
  ['51-["baz",{"_placeholder":true,"num":0}]', { type: "BINARY_EVENT", nsp: "/", attachments: 1, data: ["baz", placeholder(0)] }],
  [
    '52-/admin,["baz",{"_placeholder":true,"num":0},{"_placeholder":true,"num":1}]',
    { type: "BINARY_EVENT", nsp: "/admin", attachments: 2, data: ["baz", placeholder(0), placeholder(1)] },
  ],
  ['212["foo"]', { type: "EVENT", nsp: "/", id: 12, data: ["foo"] }],
  ['3/admin,13["bar"]', { type: "ACK", nsp: "/admin", id: 13, data: ["bar"] }],
  ['61-15["bar",{"_placeholder":true,"num":0}]', { type: "BINARY_ACK", nsp: "/", attachments: 1, id: 15, data: ["bar", placeholder(0)] }],
  ["1", { type: "DISCONNECT", nsp: "/" }],
  ["1/admin,", { type: "DISCONNECT", nsp: "/admin" }],
];

describe("the codec", () => {
  it.each(examples)("encodes and decodes %s", (text, packet) => {
    expect(encodeSioPacket(packet)).toBe(text);
    expect(decodeSioPacket(text)).toEqual(packet);
  });

  it("decodes a namespace with no comma at the end of the text", () => {
    expect(decodeSioPacket("1/admin")).toEqual({ type: "DISCONNECT", nsp: "/admin" });
  });

  it("decodes an empty array as a payload", () => {
    expect(decodeSioPacket("313[]")).toEqual({ type: "ACK", nsp: "/", id: 13, data: [] });
  });

  it.each(["", "7", "x", "5[]", '2["foo"', "2{bad}"])("gives undefined for the text %j", (text) => {
    expect(decodeSioPacket(text)).toBeUndefined();
  });
});
