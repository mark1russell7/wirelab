/**
 * The frames of the SockJS protocol, version 0.3.3, from the protocol document (`sockjs/sockjs-protocol`,
 * `sockjs-protocol.py`). This module is a second implementation from the document. Thus the tests do not use the code
 * of a SockJS server or of the client.
 */

/** The open frame. The server sends it at the start of each new session. */
export const openFrame: string = "o";

/** The heartbeat frame. */
export const heartbeatFrame: string = "h";

/** The prelude of the transport `xhr_streaming`: 2048 bytes of `h` and a line feed. */
export const streamingPrelude: string = `${"h".repeat(2048)}\n`;

/** The prelude of the transport `eventsource`: a new line. */
export const eventSourcePrelude: string = "\r\n";

/**
 * This function gives the event of a frame on the transport `eventsource`. The document shows no frame with `%`, CR, LF
 * or NUL. The reference server sockjs-node 0.3.24 writes each of these characters as `%XX` (`escape_selected` in
 * `lib/utils.js`), and the client gives each data to `decodeURI`.
 */
export function eventSourceEvent(frame: string): string {
  const data = frame.replace(/[%\r\n\0]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
  return `data: ${data}\r\n\r\n`;
}

/**
 * The characters that a SockJS server escapes, from `escapable_by_server` of the protocol document. The document gives
 * the reason: some runtimes change these characters on the wire.
 */
const escapableByServer = /[\u0000-\u001f\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufff0-\uffff]/g;

/** This function gives the JSON text of a string, with each character of `escapable_by_server` as `\uXXXX`. */
export function serverQuote(text: string): string {
  return JSON.stringify(text).replace(escapableByServer, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** This function gives the array frame of a list of messages: `a` and a JSON array of strings. */
export function arrayFrame(messages: readonly string[]): string {
  return `a[${messages.map(serverQuote).join(",")}]`;
}

/** This function gives the close frame of a code and a reason: `c` and a JSON array, for example `c[3000,"Go away!"]`. */
export function closeFrame(code: number, reason: string): string {
  return `c[${String(code)},${serverQuote(reason)}]`;
}

/**
 * This function gives the messages of a body that the client sent: a JSON array of strings. It gives `undefined` for
 * a body that is not a JSON array of strings.
 */
export function parseSent(body: string): readonly string[] | undefined {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return undefined;
  return value as string[];
}

/**
 * The code units that the client escapes, from `escapable_by_client` of the protocol document. A number is one code
 * unit. A pair is a range with its two ends. The quote and the backslash are not in this list, because each JSON
 * encoder escapes them.
 */
export const clientEscapes: readonly (number | readonly [number, number])[] = [
  // 1092 code units in 111 ranges
  [0x0000, 0x001f], [0x007f, 0x009f], 0x00ad, [0x0300, 0x0333], [0x033d, 0x0346], [0x034a, 0x034c], [0x0350, 0x0352],
  [0x0357, 0x0358], [0x035c, 0x0362], 0x0374, 0x037e, 0x0387, [0x0591, 0x05af], 0x05c4, [0x0600, 0x0604],
  [0x0610, 0x0617], [0x0653, 0x0654], [0x0657, 0x065b], [0x065d, 0x065e], [0x06df, 0x06e2], [0x06eb, 0x06ec], 0x070f,
  0x0730, [0x0732, 0x0733], [0x0735, 0x0736], 0x073a, 0x073d, [0x073f, 0x0741], 0x0743, 0x0745, 0x0747,
  [0x07eb, 0x07f1], 0x0951, [0x0958, 0x095f], [0x09dc, 0x09dd], 0x09df, 0x0a33, 0x0a36, [0x0a59, 0x0a5b], 0x0a5e,
  [0x0b5c, 0x0b5d], [0x0e38, 0x0e39], 0x0f43, 0x0f4d, 0x0f52, 0x0f57, 0x0f5c, 0x0f69, [0x0f72, 0x0f76], 0x0f78,
  [0x0f80, 0x0f83], 0x0f93, 0x0f9d, 0x0fa2, 0x0fa7, 0x0fac, 0x0fb9, [0x17b4, 0x17b5], [0x1939, 0x193a], 0x1a17,
  0x1b6b, [0x1cda, 0x1cdb], [0x1dc0, 0x1dcf], 0x1dfc, 0x1dfe, 0x1f71, 0x1f73, 0x1f75, 0x1f77, 0x1f79, 0x1f7b, 0x1f7d,
  0x1fbb, 0x1fbe, 0x1fc9, 0x1fcb, 0x1fd3, 0x1fdb, 0x1fe3, 0x1feb, [0x1fee, 0x1fef], 0x1ff9, 0x1ffb, 0x1ffd,
  [0x2000, 0x20ff], 0x2126, [0x212a, 0x212b], [0x2329, 0x232a], 0x2adc, [0x302b, 0x302c], [0xaab2, 0xaab3],
  [0xf900, 0xfa0d], 0xfa10, 0xfa12, [0xfa15, 0xfa1e], 0xfa20, 0xfa22, [0xfa25, 0xfa26], [0xfa2a, 0xfa2d],
  [0xfa30, 0xfa6d], [0xfa70, 0xfad9], 0xfb1d, 0xfb1f, [0xfb2a, 0xfb36], [0xfb38, 0xfb3c], 0xfb3e, [0xfb40, 0xfb41],
  [0xfb43, 0xfb44], [0xfb46, 0xfb4e], 0xfeff, [0xfff0, 0xffff],
];

/** This function gives true when the protocol document tells the client to escape the code unit. */
export function escapableByClient(unit: number): boolean {
  return clientEscapes.some((item) => (typeof item === "number" ? item === unit : unit >= item[0] && unit <= item[1]));
}

/** This function gives each code unit of `escapable_by_client`, in order. */
export function clientEscapeUnits(): readonly number[] {
  return clientEscapes.flatMap((item) => {
    if (typeof item === "number") return [item];
    return Array.from({ length: item[1] - item[0] + 1 }, (_, offset) => item[0] + offset);
  });
}

/**
 * This function gives the code units of a JSON string literal that are not escaped. Each `\uXXXX` escape and each
 * escape of one character, for example `\n`, is escaped.
 */
export function rawUnits(literal: string): readonly number[] {
  const out: number[] = [];
  for (let i = 0; i < literal.length; i++) {
    if (literal[i] === "\\") {
      i += literal[i + 1] === "u" ? 5 : 1;
      continue;
    }
    out.push(literal.charCodeAt(i));
  }
  return out;
}

/** This function gives the text of a list of code units as ranges, for example `U+007F-U+009F U+00AD`. */
export function unitRanges(units: readonly number[]): string {
  const hex = (unit: number): string => `U+${unit.toString(16).toUpperCase().padStart(4, "0")}`;
  const sorted = [...new Set(units)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let start = 0; start < sorted.length; ) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1] === (sorted[end] ?? 0) + 1) end += 1;
    const first = sorted[start] ?? 0;
    const last = sorted[end] ?? 0;
    ranges.push(first === last ? hex(first) : `${hex(first)}-${hex(last)}`);
    start = end + 1;
  }
  return ranges.join(" ");
}
