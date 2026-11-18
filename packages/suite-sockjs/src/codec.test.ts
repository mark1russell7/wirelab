// The codec of the tests comes from the protocol document. These tests compare it with the examples and the lists of the document.
import { describe, expect, it } from "vitest";
import {
  arrayFrame,
  clientEscapes,
  clientEscapeUnits,
  closeFrame,
  escapableByClient,
  eventSourceEvent,
  eventSourcePrelude,
  heartbeatFrame,
  openFrame,
  parseSent,
  rawUnits,
  serverQuote,
  streamingPrelude,
  unitRanges,
} from "./codec.ts";

/** The pattern of `escapable_by_client`, as the protocol document writes it. */
const protocolPattern = String.raw`[\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u2000-\u20ff\ufeff\ufff0-\uffff\x00-\x1f\ufffe\uffff\u0300-\u0333\u033d-\u0346\u034a-\u034c\u0350-\u0352\u0357-\u0358\u035c-\u0362\u0374\u037e\u0387\u0591-\u05af\u05c4\u0610-\u0617\u0653-\u0654\u0657-\u065b\u065d-\u065e\u06df-\u06e2\u06eb-\u06ec\u0730\u0732-\u0733\u0735-\u0736\u073a\u073d\u073f-\u0741\u0743\u0745\u0747\u07eb-\u07f1\u0951\u0958-\u095f\u09dc-\u09dd\u09df\u0a33\u0a36\u0a59-\u0a5b\u0a5e\u0b5c-\u0b5d\u0e38-\u0e39\u0f43\u0f4d\u0f52\u0f57\u0f5c\u0f69\u0f72-\u0f76\u0f78\u0f80-\u0f83\u0f93\u0f9d\u0fa2\u0fa7\u0fac\u0fb9\u1939-\u193a\u1a17\u1b6b\u1cda-\u1cdb\u1dc0-\u1dcf\u1dfc\u1dfe\u1f71\u1f73\u1f75\u1f77\u1f79\u1f7b\u1f7d\u1fbb\u1fbe\u1fc9\u1fcb\u1fd3\u1fdb\u1fe3\u1feb\u1fee-\u1fef\u1ff9\u1ffb\u1ffd\u2000-\u2001\u20d0-\u20d1\u20d4-\u20d7\u20e7-\u20e9\u2126\u212a-\u212b\u2329-\u232a\u2adc\u302b-\u302c\uaab2-\uaab3\uf900-\ufa0d\ufa10\ufa12\ufa15-\ufa1e\ufa20\ufa22\ufa25-\ufa26\ufa2a-\ufa2d\ufa30-\ufa6d\ufa70-\ufad9\ufb1d\ufb1f\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40-\ufb41\ufb43-\ufb44\ufb46-\ufb4e]`;

/** This function gives the character of a code unit. */
function unit(code: number): string {
  return String.fromCharCode(code);
}

describe("the codec", () => {
  it("gives the frames and the preludes of the protocol document", () => {
    expect(openFrame).toBe("o");
    expect(heartbeatFrame).toBe("h");
    expect(streamingPrelude).toHaveLength(2049);
    expect(streamingPrelude).toBe(`${"h".repeat(2048)}\n`);
    expect(eventSourcePrelude).toBe("\r\n");
  });

  it("writes an EventSource event as the protocol document and the reference server do", () => {
    expect(eventSourceEvent("o")).toBe("data: o\r\n\r\n");
    expect(eventSourceEvent('a["x"]')).toBe('data: a["x"]\r\n\r\n');
    expect(eventSourceEvent(arrayFrame(["100% %41"]))).toBe('data: a["100%25 %2541"]\r\n\r\n');
    expect(eventSourceEvent("a\rb\nc\u0000d")).toBe("data: a%0Db%0Ac%00d\r\n\r\n");
    expect(decodeURI(eventSourceEvent(arrayFrame(["%zz %25"])).slice(6, -4))).toBe('a["%zz %25"]');
  });

  it("encodes the examples of the protocol document", () => {
    expect(arrayFrame(["message"])).toBe('a["message"]');
    expect(arrayFrame(["x"])).toBe('a["x"]');
    expect(closeFrame(3000, "Go away!")).toBe('c[3000,"Go away!"]');
    expect(closeFrame(2010, "Another connection still open")).toBe('c[2010,"Another connection still open"]');
  });

  it("escapes each character of escapable_by_server, and no other character", () => {
    expect(serverQuote(`a${unit(0)}b${unit(0x2028)}c${unit(0xfff0)}`)).toBe('"a\\u0000b\\u2028c\\ufff0"');
    expect(serverQuote(`${unit(0xe9)}${unit(0x2713)}`)).toBe(`"${unit(0xe9)}${unit(0x2713)}"`);
    expect(serverQuote("\n")).toBe('"\\n"');
    const text = `x${unit(0x200c)}y${unit(0x2060)}z`;
    expect(JSON.parse(serverQuote(text))).toBe(text);
  });

  it("reads the body of the client as a JSON array of strings", () => {
    expect(parseSent('["x"]')).toEqual(["x"]);
    expect(parseSent('["a","b"]')).toEqual(["a", "b"]);
    expect(parseSent("[]")).toEqual([]);
    expect(parseSent('"x"')).toBeUndefined();
    expect(parseSent("[1]")).toBeUndefined();
    expect(parseSent("not json")).toBeUndefined();
  });

  it("has each code unit of escapable_by_client, other than the quote and the backslash", () => {
    const pattern = new RegExp(protocolPattern);
    const fromDocument = Array.from({ length: 0x10000 }, (_, code) => code).filter((code) => code !== 0x22 && code !== 0x5c && pattern.test(unit(code)));
    expect(fromDocument).toHaveLength(1092);
    expect(clientEscapeUnits()).toEqual(fromDocument);
    expect(clientEscapes).toHaveLength(111);
  });

  it("tells which code units the client escapes", () => {
    expect(escapableByClient(0x00)).toBe(true);
    expect(escapableByClient(0x7f)).toBe(true);
    expect(escapableByClient(0x2028)).toBe(true);
    expect(escapableByClient(0xfeff)).toBe(true);
    expect(escapableByClient(0x41)).toBe(false);
    expect(escapableByClient(0x22)).toBe(false);
    expect(escapableByClient(0xe9)).toBe(false);
  });

  it("gives the code units of a JSON literal that are not escaped", () => {
    expect(rawUnits("a\\u0041\\nb")).toEqual([0x61, 0x62]);
    expect(rawUnits(`"${unit(0x7f)}\\u0080"`)).toEqual([0x22, 0x7f, 0x22]);
    expect(rawUnits("")).toEqual([]);
  });

  it("writes a list of code units as ranges", () => {
    expect(unitRanges([0xad, 0x7f, 0x80, 0x81, 0x80])).toBe("U+007F-U+0081 U+00AD");
    expect(unitRanges([0xfeff])).toBe("U+FEFF");
    expect(unitRanges([])).toBe("");
  });
});
