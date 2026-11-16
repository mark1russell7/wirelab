/**
 * The codec of the Socket.IO packets of protocol version 5, as the built-in parser encodes them. Each packet is text,
 * and a binary packet also has attachments. Each part goes in one Engine.IO `message` packet.
 */

/** The type of a Socket.IO packet. */
export type SioPacketType = "CONNECT" | "DISCONNECT" | "EVENT" | "ACK" | "CONNECT_ERROR" | "BINARY_EVENT" | "BINARY_ACK";

/** The types of the packets, in the order of their numbers. */
export const SIO_PACKET_TYPES: readonly SioPacketType[] = ["CONNECT", "DISCONNECT", "EVENT", "ACK", "CONNECT_ERROR", "BINARY_EVENT", "BINARY_ACK"];

/** One Socket.IO packet, without the bytes of its attachments. */
export interface SioPacket {
  readonly type: SioPacketType;
  /** The namespace. The encoded text has a namespace part only when the namespace is not `/`. */
  readonly nsp: string;
  /** The event ID of an event that asks for an acknowledgement, or of its acknowledgement. */
  readonly id?: number;
  /** The payload, with a placeholder for each attachment. */
  readonly data?: unknown;
  /** The number of attachments of a binary packet. */
  readonly attachments?: number;
}

/** A placeholder of an attachment in the payload of a binary packet. */
export interface Placeholder {
  readonly _placeholder: true;
  readonly num: number;
}

/** This function gives the placeholder of the attachment with the given number. */
export function placeholder(num: number): Placeholder {
  return { _placeholder: true, num };
}

/** This function encodes a packet: its type, the number of attachments, the namespace, the event ID and the payload. */
export function encodeSioPacket(packet: SioPacket): string {
  let text = String(SIO_PACKET_TYPES.indexOf(packet.type));
  if (packet.attachments !== undefined) text += `${packet.attachments}-`;
  if (packet.nsp !== "/") text += `${packet.nsp},`;
  if (packet.id !== undefined) text += String(packet.id);
  if (packet.data !== undefined) text += JSON.stringify(packet.data);
  return text;
}

/** This function decodes the text of a packet. It gives `undefined` for text that is not a packet. */
export function decodeSioPacket(text: string): SioPacket | undefined {
  const type = SIO_PACKET_TYPES[Number(text.charAt(0))];
  if (!/^[0-6]/.test(text) || type === undefined) return undefined;
  let rest = text.slice(1);
  let attachments: number | undefined;
  if (type === "BINARY_EVENT" || type === "BINARY_ACK") {
    const head = /^(\d+)-/.exec(rest);
    if (head === null) return undefined;
    attachments = Number(head[1]);
    rest = rest.slice(head[0].length);
  }
  let nsp = "/";
  if (rest.startsWith("/")) {
    const comma = rest.indexOf(",");
    nsp = comma === -1 ? rest : rest.slice(0, comma);
    rest = comma === -1 ? "" : rest.slice(comma + 1);
  }
  const digits = /^\d+/.exec(rest);
  if (digits !== null) rest = rest.slice(digits[0].length);
  let data: unknown;
  if (rest !== "") {
    try {
      data = JSON.parse(rest);
    } catch {
      return undefined;
    }
  }
  return {
    type,
    nsp,
    ...(digits === null ? {} : { id: Number(digits[0]) }),
    ...(data === undefined ? {} : { data }),
    ...(attachments === undefined ? {} : { attachments }),
  };
}
