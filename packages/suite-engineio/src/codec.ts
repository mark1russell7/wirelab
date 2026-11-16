/**
 * The packets and the payloads of the Engine.IO protocol, version 4, for the HTTP long-polling transport. This module
 * is a second implementation from the protocol document. Thus the tests do not depend on `engine.io-parser`.
 */

/** The types of a packet. The number of a type is its position in `PACKET_TYPES`. */
export type PacketType = "open" | "close" | "ping" | "pong" | "message" | "upgrade" | "noop";

/** The packet types, in the order of their numbers: `open` is 0, and `noop` is 6. */
export const PACKET_TYPES: readonly PacketType[] = ["open", "close", "ping", "pong", "message", "upgrade", "noop"];

/** The record separator. It separates the packets of one payload. */
export const SEPARATOR: string = "\x1e";

/** One packet. A binary message has bytes as its data. Each other packet has text, and the text is empty when the packet has no data. */
export interface Packet {
  readonly type: PacketType;
  readonly data: string | Uint8Array;
}

/** The fields of the open packet. */
export interface Handshake {
  /** The identifier of the session. */
  readonly sid: string;
  /** The names of the transports that the client can change to. */
  readonly upgrades: readonly string[];
  /** The time in ms between two `ping` packets of the server. */
  readonly pingInterval: number;
  /** The time in ms that the server waits for a `pong` packet. */
  readonly pingTimeout: number;
  /** The largest number of bytes in one payload of the client. */
  readonly maxPayload: number;
}

/** This function gives the open packet of a handshake. */
export function openPacket(handshake: Handshake): Packet {
  return { type: "open", data: JSON.stringify(handshake) };
}

/** This function gives the text form of a packet. A binary message becomes the character `b` and the base64 form of its bytes. */
export function encodePacket(packet: Packet): string {
  if (typeof packet.data === "string") return `${PACKET_TYPES.indexOf(packet.type)}${packet.data}`;
  if (packet.type !== "message") throw new RangeError(`A packet of the type ${packet.type} has no binary data.`);
  return `b${Buffer.from(packet.data).toString("base64")}`;
}

/** This function gives the payload of a list of packets: their text forms, with the record separator between them. */
export function encodePayload(packets: readonly Packet[]): string {
  return packets.map(encodePacket).join(SEPARATOR);
}

const TYPE_DIGIT = /^[0-6]$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** This function gives the packet of a text form. It gives `undefined` when the text is not a packet. */
export function decodePacket(text: string): Packet | undefined {
  const first = text.charAt(0);
  if (first === "b") {
    const base64 = text.slice(1);
    return BASE64.test(base64) ? { type: "message", data: new Uint8Array(Buffer.from(base64, "base64")) } : undefined;
  }
  if (!TYPE_DIGIT.test(first)) return undefined;
  const type = PACKET_TYPES[Number(first)];
  return type === undefined ? undefined : { type, data: text.slice(1) };
}

/** This function gives each packet of a payload, in order. A part that is not a packet gives `undefined`. */
export function decodePayload(payload: string): readonly (Packet | undefined)[] {
  return payload.split(SEPARATOR).map(decodePacket);
}
