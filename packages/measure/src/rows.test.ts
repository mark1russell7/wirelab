import { rawTables } from "@wirelab/catalog";
import { describe, expect, it } from "vitest";
import { reportText } from "./report.ts";
import { WHAT, absentOf, addRun, runRows, sourceId } from "./rows.ts";
import type { Failure, Measured } from "./run.ts";

const AT = "2026-11-20T06:17:42.123Z";
const SOURCE = "measure-2026-11-20-0617";
const WEEK = { start: "2026-11-12", end: "2026-11-18" };

const measured: Measured = {
  downloads: [
    { package: "a", ...WEEK, downloads: 10 },
    { package: "outside", ...WEEK, downloads: 99 },
  ],
  dependents: [{ package: "a", version: "1.0.0", dependents: 5, direct: 2, indirect: 3 }],
  hits: [{ package: "b", period: "month", start: null, end: null, hits: 7, rank: null, typeRank: null, previousHits: null }],
  documents: [
    { package: "a", modified: "2026-11-10T08:00:00.000Z", distTags: { latest: "1.0.0" }, versions: 3, latestDeprecated: null },
    { package: "b", modified: "2026-09-01T00:00:00.000Z", distTags: { latest: "0.3.1" }, versions: 1, latestDeprecated: "use c" },
    { package: "c", modified: null, distTags: { latest: "2.0.0" }, versions: 1, latestDeprecated: null },
    { package: "d", modified: "2026-01-01T00:00:00.000Z", distTags: { next: "1.0.0-rc.1" }, versions: 1, latestDeprecated: null },
  ],
  failures: [],
};

describe("sourceId", () => {
  it("gives the UTC day, hour and minute of the time", () => {
    expect(sourceId(AT)).toBe(SOURCE);
  });

  it("refuses a text that is not a UTC time", () => {
    expect(() => sourceId("2026-11-20")).toThrow('"2026-11-20" is not a UTC time.');
  });
});

describe("runRows", () => {
  const names = ["a", "b", "c", "d"];

  it("gives a row for each measure of a package of the list", () => {
    const rows = runRows(measured, names, AT);
    expect(rows.usage).toEqual([
      { package: "a", source: SOURCE, metric: "npm-downloads-week", value: 10 },
      { package: "a", source: SOURCE, metric: "deps-dev-dependents-direct", value: 2 },
      { package: "a", source: SOURCE, metric: "deps-dev-dependents-indirect", value: 3 },
      { package: "b", source: SOURCE, metric: "jsdelivr-hits-month", value: 7 },
    ]);
  });

  it("gives a registry row only with the version of latest and the day of the last change", () => {
    expect(runRows(measured, names, AT).registry).toEqual([
      { package: "a", source: SOURCE, version: "1.0.0", packumentModified: "2026-11-10" },
      { package: "b", source: SOURCE, version: "0.3.1", packumentModified: "2026-09-01", deprecated: "use c" },
    ]);
  });

  it("gives the source, with the packages that have no value in its note", () => {
    expect(runRows(measured, names, AT).source).toEqual({
      id: SOURCE,
      at: AT,
      what: WHAT,
      note: "Packages with no value: npm-downloads-week 3, deps-dev-dependents-direct 3, deps-dev-dependents-indirect 3, jsdelivr-hits-month 3, registry 2.",
    });
    const failure: Failure = { recipe: "jsdelivr-hits", url: "u", outcome: "error", status: 500, note: null };
    expect(runRows({ ...measured, failures: [failure, failure] }, names, AT).source.note).toMatch(/^2 requests failed\. Packages with no value: /);
  });
});

describe("absentOf", () => {
  it("gives the packages with no row, for each metric and for the registry", () => {
    const rows = runRows(measured, ["a", "b"], AT);
    expect(absentOf(["a", "b"], rows.usage, rows.registry)).toEqual([
      { measure: "npm-downloads-week", packages: ["b"] },
      { measure: "deps-dev-dependents-direct", packages: ["b"] },
      { measure: "deps-dev-dependents-indirect", packages: ["b"] },
      { measure: "jsdelivr-hits-month", packages: ["a"] },
      { measure: "registry", packages: [] },
    ]);
  });
});

describe("addRun", () => {
  const packages = rawTables.packages as ReadonlyArray<{ readonly name: string }>;
  const [first, second] = packages.map((row) => row.name);
  const ofCatalog: Measured = {
    ...measured,
    downloads: [{ package: first!, ...WEEK, downloads: 10 }],
    dependents: [],
    hits: [],
    documents: [{ package: second!, modified: "2026-11-10T08:00:00.000Z", distTags: { latest: "1.0.0" }, versions: 3, latestDeprecated: null }],
  };

  it("adds the source and its rows to the tables of the catalog", () => {
    const rows = runRows(ofCatalog, [first!, second!], AT);
    const next = addRun(rawTables, rows);
    expect(next.sources).toEqual([...rawTables.sources, rows.source]);
    expect(next.usage.slice(rawTables.usage.length)).toEqual(rows.usage);
    expect(next.registry.slice(rawTables.registry.length)).toEqual(rows.registry);
    expect(next.packages).toBe(rawTables.packages);
  });

  it("refuses rows that the catalog refuses", () => {
    const rows = runRows(ofCatalog, [first!, second!], AT);
    const stray = { ...rows, usage: [...rows.usage, { package: "not-in-the-catalog", source: SOURCE, metric: "npm-downloads-week" as const, value: 1 }] };
    expect(() => addRun(rawTables, stray)).toThrow(
      "The tables of the run have problems:\nusage not-in-the-catalog names not-in-the-catalog, and that row is not in the catalog.",
    );
    expect(() => addRun(addRun(rawTables, rows), rows)).toThrow("sources repeats an id.");
  });
});

describe("reportText", () => {
  it("gives the counts, the failed requests and the packages with no value", () => {
    const failure: Failure = { recipe: "jsdelivr-hits", url: "https://x.example/a|b", outcome: "error", status: 500, note: "status 500\nagain" };
    const rows = runRows(measured, ["a", "b"], AT);
    expect(reportText(rows, ["a", "b"], [failure])).toBe(
      [
        `## The measure run ${SOURCE}`,
        "",
        `2 packages, source time ${AT}.`,
        "",
        "| Measure | Packages with a value | Packages with no value |",
        "| --- | --- | --- |",
        "| npm-downloads-week | 1 | 1 |",
        "| deps-dev-dependents-direct | 1 | 1 |",
        "| deps-dev-dependents-indirect | 1 | 1 |",
        "| jsdelivr-hits-month | 1 | 1 |",
        "| registry | 2 | 0 |",
        "",
        "### Requests that failed (1)",
        "",
        "| Recipe | URL | Outcome | Status | Note |",
        "| --- | --- | --- | --- | --- |",
        "| jsdelivr-hits | https://x.example/a\\|b | error | 500 | status 500 again |",
        "",
        "### Packages with no value",
        "",
        "- npm-downloads-week: `b`",
        "- deps-dev-dependents-direct: `b`",
        "- deps-dev-dependents-indirect: `b`",
        "- jsdelivr-hits-month: `a`",
        "",
      ].join("\n"),
    );
  });

  it("lists the first failures in the order of recipe and URL, and tells that the list is cut", () => {
    const failures: Failure[] = Array.from({ length: 52 }, (_, i) => ({
      recipe: i % 2 === 0 ? "npm-downloads" : "jsdelivr-hits",
      url: `https://x.example/${String(i).padStart(2, "0")}`,
      outcome: "rate-limited",
      status: 429,
      note: null,
    }));
    const text = reportText(runRows({ ...measured, failures }, ["a"], AT), ["a"], failures);
    const listed = text.split("\n").filter((line) => line.startsWith("| npm-downloads |") || line.startsWith("| jsdelivr-hits |"));
    expect(listed).toHaveLength(50);
    expect(listed[0]).toBe("| jsdelivr-hits | https://x.example/01 | rate-limited | 429 |  |");
    expect(listed.at(-1)).toBe("| npm-downloads | https://x.example/46 | rate-limited | 429 |  |");
    expect(text).toContain("### Requests that failed (52)");
    expect(text).toContain("The list shows the first 50.");
  });

  it("has no list of packages when each package has each value", () => {
    const full: Measured = {
      downloads: [{ package: "a", ...WEEK, downloads: 1 }],
      dependents: [{ package: "a", version: "1.0.0", dependents: 1, direct: 1, indirect: 0 }],
      hits: [{ package: "a", period: "month", start: null, end: null, hits: 1, rank: null, typeRank: null, previousHits: null }],
      documents: [measured.documents[0]!],
      failures: [],
    };
    const text = reportText(runRows(full, ["a"], AT), ["a"], []);
    expect(text).not.toContain("###");
  });
});
