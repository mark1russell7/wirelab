import { describe, expect, it } from "vitest";
import { addReadings, catalogProblems, rawTables, type Source, type UsageRow } from "./index.ts";

const OLD_SOURCE: Source = { id: "old", at: "2026-11-13T02:59:16Z", what: "An old read." };
const OLD_ROW: UsageRow = { package: "a", source: "old", metric: "npm-downloads-week", value: 5 };
const NEW_SOURCE: Source = { id: "new", at: "2026-11-16T06:00:00Z", what: "A new read." };

describe("addReadings", () => {
  it("adds the source and one row for each reading, and keeps the old rows", () => {
    const tables = addReadings({ sources: [OLD_SOURCE], usage: [OLD_ROW] }, NEW_SOURCE, [
      { package: "a", metric: "npm-downloads-week", value: 7 },
      { package: "a", metric: "jsdelivr-hits-month", value: 0 },
    ]);
    expect(tables.sources).toEqual([OLD_SOURCE, NEW_SOURCE]);
    expect(tables.usage).toEqual([
      OLD_ROW,
      { package: "a", source: "new", metric: "npm-downloads-week", value: 7 },
      { package: "a", source: "new", metric: "jsdelivr-hits-month", value: 0 },
    ]);
  });

  it("throws for a source id that the tables already have", () => {
    expect(() => addReadings({ sources: [OLD_SOURCE], usage: [] }, { ...NEW_SOURCE, id: "old" }, [])).toThrow(/already has the source old/);
  });

  it("throws for two readings of the same package and measure", () => {
    const twice = [
      { package: "a", metric: "npm-downloads-week" as const, value: 1 },
      { package: "a", metric: "npm-downloads-week" as const, value: 2 },
    ];
    expect(() => addReadings({ sources: [], usage: [] }, NEW_SOURCE, twice)).toThrow(/a \| npm-downloads-week/);
  });

  it("gives tables that the check of the catalog accepts", () => {
    const name = (rawTables.packages[0] as { readonly name: string }).name;
    const tables = addReadings(
      { sources: rawTables.sources as readonly Source[], usage: rawTables.usage as readonly UsageRow[] },
      { ...NEW_SOURCE, id: "measures-test" },
      [{ package: name, metric: "deps-dev-dependents-direct", value: 3 }],
    );
    expect(catalogProblems({ ...rawTables, ...tables })).toEqual([]);
  });
});
