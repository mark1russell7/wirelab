import { describe, expect, it } from "vitest";
import { addTransportScan, catalogProblems, rawTables, transportUses, type PackageTransport, type Source, type TransportGlobal } from "./index.ts";

const GLOBALS: readonly TransportGlobal[] = [
  { transport: "websocket", global: "WebSocket" },
  { transport: "fetch", global: "fetch" },
];

const blob = (sha: string, globals: unknown[], ok = true): unknown => ({ kind: "blob", key: `${sha}:js:facts/5`, facts: { ok, facts: { globals } } });
const file = (repo: string, path: string, sha: string, test = false): unknown => ({ kind: "file", repo, path, blob: sha, bytes: 10, test });

/** The shape of the output of `codeatlas facts --files published` for the published files of partysocket 1.1.4. */
const RECORDS: readonly unknown[] = [
  { kind: "repo", repo: "p1", commit: "c", counts: {} },
  file("p1", "dist/ws.js", "aaa"),
  file("p1", "dist/index.js", "bbb"),
  file("p1", "dist/ws.test.js", "aaa", true),
  file("p2", "dist/other.js", "aaa"),
  blob("aaa", [
    { name: "WebSocket", use: "typeof", line: 367, count: 1 },
    { name: "WebSocket", use: "read", line: 386, count: 2 },
    { name: "console", use: "read", line: 9, count: 4 },
  ]),
  blob("bbb", [{ name: "fetch", use: "read", line: 148, count: 1 }]),
  blob("ccc", [{ name: "fetch", use: "call", line: 1, count: 1 }], false),
];

describe("transportUses", () => {
  it("gives one row for each transport global of each published file, and skips the test files and other repositories", () => {
    const rows = transportUses(RECORDS, [{ repo: "p1", package: "partysocket", version: "1.1.4" }], GLOBALS, "scan");
    expect(rows).toEqual([
      { package: "partysocket", version: "1.1.4", transport: "fetch", global: "fetch", use: "read", file: "dist/index.js", line: 148, count: 1, source: "scan" },
      { package: "partysocket", version: "1.1.4", transport: "websocket", global: "WebSocket", use: "read", file: "dist/ws.js", line: 386, count: 2, source: "scan" },
      { package: "partysocket", version: "1.1.4", transport: "websocket", global: "WebSocket", use: "typeof", file: "dist/ws.js", line: 367, count: 1, source: "scan" },
    ]);
  });

  it("gives no row for a blob whose parse failed", () => {
    const rows = transportUses([file("p1", "x.js", "ccc"), blob("ccc", [{ name: "fetch", use: "call", line: 1, count: 1 }], false)], [{ repo: "p1", package: "a", version: "1" }], GLOBALS, "scan");
    expect(rows).toEqual([]);
  });
});

describe("addTransportScan", () => {
  const OLD: Source = { id: "old", at: "2026-11-20T00:00:00Z", what: "An old scan." };
  const NEW: Source = { id: "new", at: "2026-11-24T00:00:00Z", what: "A new scan." };
  const row = (pkg: string, source: string): PackageTransport => ({ package: pkg, version: "1", transport: "fetch", global: "fetch", use: "call", file: "a.js", line: 1, count: 1, source });

  it("replaces the rows of the scanned packages and keeps the other rows", () => {
    const tables = addTransportScan({ sources: [OLD], packageTransports: [row("a", "old"), row("b", "old")] }, NEW, ["a"], [row("a", "new")]);
    expect(tables.sources).toEqual([OLD, NEW]);
    expect(tables.packageTransports).toEqual([row("b", "old"), row("a", "new")]);
  });

  it("throws for a source id that the tables already have", () => {
    expect(() => addTransportScan({ sources: [OLD], packageTransports: [] }, OLD, [], [])).toThrow(/already has the source old/);
  });

  it("throws for a row of a package that the scan did not read", () => {
    expect(() => addTransportScan({ sources: [], packageTransports: [] }, NEW, ["a"], [row("b", "new")])).toThrow(/not a row of the scan new/);
  });
});

describe("the checks of the transport tables", () => {
  it("refuse a global that shows two transports", () => {
    const problems = catalogProblems({ ...rawTables, transportGlobals: [...rawTables.transportGlobals, { transport: "xhr", global: "fetch" }] });
    expect(problems).toContain("transportGlobals: the global fetch shows more than one transport.");
  });

  it("refuse a row whose global does not show its transport", () => {
    const source = (rawTables.sources[0] as Source).id;
    const pkg = (rawTables.packages[0] as { name: string }).name;
    const bad = { package: pkg, version: "1", transport: "xhr", global: "fetch", use: "call", file: "a.js", line: 1, count: 1, source };
    const problems = catalogProblems({ ...rawTables, packageTransports: [bad] });
    expect(problems).toContain(`packageTransports ${pkg} a.js: transportGlobals does not give the global fetch to the transport xhr.`);
  });
});
