import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Catalog, TABLE_FILES, catalog, catalogProblems, priorityOrder, rawTables, tableText } from "./index.ts";

const dataDir = join(import.meta.dirname, "data");

describe("the tables of the catalog", () => {
  it("have no problem", () => {
    expect(catalogProblems(rawTables)).toEqual([]);
  });

  it("are each in the canonical form of their file", () => {
    for (const [table, file] of Object.entries(TABLE_FILES) as [keyof Catalog, string][]) {
      const text = readFileSync(join(dataDir, file), "utf8").replace(/\r\n/g, "\n");
      expect(text, file).toBe(tableText(table, catalog[table]));
    }
  });

  it("give each package a protocol, and each library protocol a package", () => {
    const spoken = new Set(catalog.packageProtocols.map((s) => s.package));
    expect(catalog.packages.filter((p) => !spoken.has(p.name))).toEqual([]);
  });
});

describe("the check", () => {
  const base = (): Record<keyof Catalog, unknown[]> => ({
    families: [{ id: "f", order: 1, title: "F", what: "F." }],
    transports: [],
    protocols: [{ id: "p", name: "P", family: "f", kind: "protocol", client: "library" }],
    packages: [{ name: "a", family: "f" }],
    packageProtocols: [{ package: "a", protocol: "p" }],
    packageLinks: [],
    sources: [{ id: "s", at: "2026-11-13T00:00:00Z", what: "S." }],
    registry: [],
    usage: [],
  });

  it("accepts a valid catalog", () => {
    expect(catalogProblems(base())).toEqual([]);
  });

  it("finds a broken key", () => {
    const raw = base();
    raw.packageProtocols.push({ package: "a", protocol: "missing" });
    expect(catalogProblems(raw)).toEqual(["packageProtocols a names missing, and that row is not in the catalog."]);
  });

  it("finds an unknown field, a value outside its set and a duplicate key", () => {
    const raw = base();
    raw.packages.push({ name: "a", family: "f", color: "red" });
    raw.protocols[0] = { id: "p", name: "P", family: "f", kind: "protocol", client: "maybe" };
    expect(catalogProblems(raw)).toEqual([
      "protocols[0].client is not one of library, native, none.",
      "packages[1] has the unknown field color.",
      "packages[1] repeats the key a.",
    ]);
  });

  it("finds a library protocol that no package speaks", () => {
    const raw = base();
    raw.protocols.push({ id: "q", name: "Q", family: "f", kind: "protocol", client: "library" });
    expect(catalogProblems(raw)).toEqual(["protocols q has the client kind library, and no package speaks it."]);
  });
});

describe("the priority order", () => {
  const fixture = (): Catalog => ({
    families: [{ id: "f", order: 1, title: "F", what: "F." }],
    transports: [],
    protocols: [{ id: "p", name: "P", family: "f", kind: "protocol", client: "library" }],
    packages: ["a", "b", "c", "d"].map((name) => ({ name, family: "f" })),
    packageProtocols: ["a", "b", "c", "d"].map((name) => ({ package: name, protocol: "p" })),
    packageLinks: [],
    sources: [
      { id: "old", at: "2026-11-01T00:00:00Z", what: "Old." },
      { id: "new", at: "2026-11-13T00:00:00Z", what: "New." },
    ],
    registry: [{ package: "a", source: "new", version: "1.0.0", packumentModified: "2026-11-01", deprecated: "Use b." }],
    usage: [
      { package: "a", source: "new", metric: "npm-downloads-week", value: 1000 },
      { package: "b", source: "new", metric: "npm-downloads-week", value: 100 },
      { package: "c", source: "old", metric: "npm-downloads-week", value: 5000 },
      { package: "c", source: "new", metric: "npm-downloads-week", value: 10 },
    ],
  });

  it("puts the most used package first, and a package with no measure last", () => {
    const order = priorityOrder(fixture());
    expect(order.map((r) => r.package)).toEqual(["b", "c", "a", "d"]);
    expect(order.map((r) => r.place)).toEqual([1, 2, 3, 4]);
    expect(order[3]?.score).toBeNull();
    expect(order[3]?.reasons).toEqual(["no measure of use yet"]);
  });

  it("reads the newest source of each measure", () => {
    const c = priorityOrder(fixture()).find((r) => r.package === "c");
    expect(c?.shares).toEqual([{ metric: "npm-downloads-week", value: 10, source: "new", share: 0.5 / 3 }]);
  });

  it("multiplies the reach of a deprecated package by the landing factor", () => {
    const a = priorityOrder(fixture()).find((r) => r.package === "a");
    expect(a?.reach).toBeCloseTo(2.5 / 3);
    expect(a?.landing).toBe(0.1);
    expect(a?.score).toBeCloseTo(0.25 / 3);
    expect(a?.reasons).toEqual(["deprecated on npm: Use b."]);
  });

  it("gives equal values the mean rank", () => {
    const f = fixture();
    const usage = f.usage.map((u) => (u.package === "b" ? { ...u, value: 1000 } : u));
    const order = priorityOrder({ ...f, registry: [], usage });
    expect(order.find((r) => r.package === "a")?.reach).toBe(order.find((r) => r.package === "b")?.reach);
  });
});
