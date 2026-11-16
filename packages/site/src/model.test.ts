import { catalog, priorityOrder } from "@wirelab/catalog";
import { describe, expect, it } from "vitest";
import { campaignCounts, catalogRows, compact, filterRows, latestUpstream, NO_FILTER, NOT_SENT } from "./model.ts";

const rows = catalogRows(catalog);

describe("the rows of the catalog page", () => {
  it("keep the priority order of the catalog, one row for each package", () => {
    expect(rows.map((r) => r.ranked.package)).toEqual(priorityOrder(catalog).map((r) => r.package));
    expect(rows).toHaveLength(catalog.packages.length);
    expect(rows.map((r) => r.ranked.place)).toEqual(rows.map((_, i) => i + 1));
  });

  it("give each fault of the catalog to its package, with its latest upstream row", () => {
    const latest = latestUpstream(catalog.upstream);
    const faults = rows.flatMap((r) => r.faults.map((f) => ({ row: r.ranked.package, f })));
    expect(faults).toHaveLength(catalog.findings.length);
    for (const { row, f } of faults) {
      expect(f.finding.package).toBe(row);
      expect(f.upstream).toBe(latest.get(f.finding.id) ?? null);
    }
  });

  it("give each row the title of its family and the repository of its package", () => {
    const titles = new Set(catalog.families.map((f) => f.title));
    expect(rows.every((r) => titles.has(r.familyTitle))).toBe(true);
    const withRepository = new Set(catalog.packageRepositories.map((r) => r.package));
    for (const r of rows) expect(r.repository !== null).toBe(withRepository.has(r.ranked.package));
  });
});

describe("the latest upstream row of a finding", () => {
  it("is the row with the newest time, in any order of the rows", () => {
    const a = { finding: "F1", at: "2026-11-13T06:27:24Z", state: "issue-open" as const };
    const b = { finding: "F1", at: "2026-11-13T06:27:36Z", state: "pr-open" as const };
    expect(latestUpstream([a, b]).get("F1")).toBe(b);
    expect(latestUpstream([b, a]).get("F1")).toBe(b);
  });
});

describe("the filter of the rows", () => {
  it("keeps each row with no filter", () => {
    expect(filterRows(rows, NO_FILTER)).toEqual(rows);
  });

  it("keeps the order, and each kept row agrees with each part of the filter", () => {
    const family = rows[0]?.ranked.family ?? "";
    const kept = filterRows(rows, { text: "", family, withFaults: true, landing: "all" });
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((r) => r.ranked.family === family && r.faults.length > 0)).toBe(true);
    expect(kept.map((r) => r.ranked.place)).toEqual([...kept.map((r) => r.ranked.place)].sort((x, y) => x - y));
  });

  it("splits the rows by the chance that a fix lands", () => {
    const full = filterRows(rows, { ...NO_FILTER, landing: "full" });
    const lowered = filterRows(rows, { ...NO_FILTER, landing: "lowered" });
    expect(full.length + lowered.length).toBe(rows.length);
    expect(full.every((r) => r.ranked.landing === 1)).toBe(true);
    expect(lowered.every((r) => r.ranked.landing < 1 && r.ranked.reasons.length > 0)).toBe(true);
  });

  it("searches the package names by words, in any case", () => {
    const kept = filterRows(rows, { ...NO_FILTER, text: "SOCKET client" });
    expect(kept.map((r) => r.ranked.package)).toContain("socket.io-client");
    expect(kept.every((r) => /socket/i.test(r.ranked.package) && /client/i.test(r.ranked.package))).toBe(true);
  });
});

describe("the counts of the campaign", () => {
  const counts = campaignCounts(catalog);

  it("count the tables of the catalog", () => {
    expect(counts.packages).toBe(catalog.packages.length);
    expect(counts.protocols).toBe(catalog.protocols.length);
    expect(counts.families).toBe(catalog.families.length);
    expect(counts.faults).toBe(catalog.findings.length);
  });

  it("give each fault one bar of each chart, the largest bar first", () => {
    for (const bars of [counts.byKind, counts.byState]) {
      expect(bars.reduce((sum, b) => sum + b.count, 0)).toBe(catalog.findings.length);
      expect(bars.every((b) => b.count > 0)).toBe(true);
      expect(bars.map((b) => b.count)).toEqual([...bars.map((b) => b.count)].sort((x, y) => y - x));
    }
  });

  it("count the faults with no upstream row as not sent", () => {
    const notSent = counts.byState.find((b) => b.key === NOT_SENT)?.count ?? 0;
    expect(counts.sent + notSent).toBe(catalog.findings.length);
    expect(counts.landed).toBeLessThanOrEqual(counts.sent);
  });

  it("give the day of the newest source", () => {
    expect(counts.newest).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(catalog.sources.every((s) => s.at.slice(0, 10) <= counts.newest)).toBe(true);
  });
});

describe("the short form of a count", () => {
  it("gives the English short form", () => {
    expect(compact(950)).toBe("950");
    expect(compact(1234)).toBe("1.2K");
    expect(compact(4_560_000)).toBe("4.6M");
  });
});
