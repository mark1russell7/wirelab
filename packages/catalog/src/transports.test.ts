import { describe, expect, it } from "vitest";
import { FACTS_FORMAT, filesOfFacts, replaceUses, transportUsesOf, type PackageFiles } from "./index.ts";
import type { Source, TransportMarker, TransportUse } from "./schema.ts";

const blob = (id: string, globals: { name: string; line: number }[], callSites: { callee: string; line: number }[], format = FACTS_FORMAT): string =>
  JSON.stringify({
    kind: "blob",
    key: `${id}:js:${format}`,
    facts: { ok: true, facts: { globals: globals.map((g) => ({ ...g, use: "new", count: 1 })), callSites: callSites.map((c, i) => ({ ordinal: i, caller: null, isNew: false, ...c })) } },
  });
const file = (repo: string, path: string, id: string, test = false): string => JSON.stringify({ kind: "file", repo, path, blob: id, bytes: 10, test });

describe("filesOfFacts", () => {
  it("joins each file of a repository to the facts of its blob", () => {
    const lines = [
      JSON.stringify({ kind: "repo", repo: "a", commit: "c1", counts: {} }),
      file("a", "dist/index.js", "b1"),
      file("a", "dist/copy.js", "b1"),
      file("a", "test/socket.test.js", "b2", true),
      file("a", "dist/broken.js", "b3"),
      file("a", "dist/old.js", "b4"),
      blob("b1", [{ name: "WebSocket", line: 3 }], [{ callee: "pc.createDataChannel", line: 9 }]),
      blob("b2", [{ name: "EventSource", line: 1 }], []),
      JSON.stringify({ kind: "blob", key: `b3:js:${FACTS_FORMAT}`, facts: { ok: false, error: "Unexpected token" } }),
      blob("b4", [{ name: "XMLHttpRequest", line: 1 }], [], "facts/4"),
      "",
    ];
    expect(filesOfFacts(lines)).toEqual(
      new Map([
        [
          "a",
          [
            { path: "dist/index.js", globals: [{ name: "WebSocket", line: 3 }], calls: [{ callee: "pc.createDataChannel", line: 9 }] },
            { path: "dist/copy.js", globals: [{ name: "WebSocket", line: 3 }], calls: [{ callee: "pc.createDataChannel", line: 9 }] },
          ],
        ],
      ]),
    );
  });

  it("names the line that is not JSON", () => {
    expect(() => filesOfFacts([file("a", "x.js", "b1"), "{"])).toThrow("The line 2 of the facts is not JSON.");
  });
});

const MARKERS: TransportMarker[] = [
  { kind: "global", name: "WebSocket", transport: "websocket" },
  { kind: "global", name: "XMLHttpRequest", transport: "xhr" },
  { kind: "method", name: "createDataChannel", transport: "rtc-datachannel" },
];

describe("transportUsesOf", () => {
  it("gives one use for each marker, with the first place in a file that is not minified", () => {
    const packages: PackageFiles[] = [
      {
        package: "a",
        version: "1.2.3",
        files: [
          { path: "dist/a.min.js", globals: [{ name: "WebSocket", line: 1 }], calls: [] },
          { path: "lib/z.js", globals: [{ name: "WebSocket", line: 40 }, { name: "fetch", line: 2 }], calls: [{ callee: "this.pc?.createDataChannel", line: 7 }] },
          { path: "lib/b.js", globals: [{ name: "WebSocket", line: 12 }], calls: [{ callee: "createDataChannel", line: 3 }] },
        ],
      },
      { package: "b", version: "0.1.0", files: [{ path: "x.min.js", globals: [{ name: "XMLHttpRequest", line: 1 }], calls: [] }] },
    ];
    expect(transportUsesOf(packages, MARKERS, "s")).toEqual([
      { package: "a", source: "s", version: "1.2.3", kind: "global", name: "WebSocket", file: "lib/b.js", line: 12, files: 3 },
      { package: "a", source: "s", version: "1.2.3", kind: "method", name: "createDataChannel", file: "lib/z.js", line: 7, files: 1 },
      { package: "b", source: "s", version: "0.1.0", kind: "global", name: "XMLHttpRequest", file: "x.min.js", line: 1, files: 1 },
    ]);
  });
});

describe("replaceUses", () => {
  const OLD: Source = { id: "old", at: "2026-11-01T00:00:00Z", what: "Old." };
  const NEW: Source = { id: "new", at: "2026-11-17T00:00:00Z", what: "New." };
  const use = (pkg: string, source: string, name = "WebSocket"): TransportUse => ({ package: pkg, source, version: "1.0.0", kind: "global", name, file: "i.js", line: 1, files: 1 });

  it("replaces the uses of each package of the read, and keeps the uses of the other packages", () => {
    const tables = { sources: [OLD], transportUses: [use("a", "old"), use("a", "old", "fetch"), use("b", "old")] };
    expect(replaceUses(tables, NEW, ["a", "c"], [use("a", "new")])).toEqual({ sources: [OLD, NEW], transportUses: [use("b", "old"), use("a", "new")] });
  });

  it("refuses a source that the tables have, and a use outside the read", () => {
    const tables = { sources: [OLD], transportUses: [] };
    expect(() => replaceUses(tables, OLD, ["a"], [])).toThrow("The sources already have old.");
    expect(() => replaceUses(tables, NEW, ["a"], [use("b", "new")])).toThrow("The use of b is not of the read new.");
  });
});
