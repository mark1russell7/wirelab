/**
 * The priority order of the catalog: the order in which the campaign tests the packages and sends their fixes.
 *
 * The order is a formula over the tables:
 *
 * 1. For each measure of use, the latest value of each package comes from its newest source.
 * 2. The share of a package on a measure is its place among the packages with that measure, from 0 to 1. The share
 *    is `(rank - 0.5) / n`, with the mean rank for equal values. A place does not depend on the unit of a measure.
 * 3. The reach of a package is the mean of its shares. A package with no measure has no reach, and it goes last.
 * 4. The chance that a fix lands multiplies the reach. A deprecated package has the factor `LANDING.deprecated`.
 *
 * npm downloads already count the installs that come through other packages, and the dependents of deps.dev count
 * the transitive dependents. Thus the reach includes transitive use.
 */
import { ranks } from "@mark1russell7/rigor-statistics";
import type { Catalog, Metric, RegistryRow, UsageRow } from "./schema.ts";
import { METRICS } from "./schema.ts";

/**
 * The factors of the chance that a fix lands. A deprecated package has no maintainer to release a fix. Its users
 * still get the issue, so the factor is not 0.
 */
export const LANDING: { readonly deprecated: number } = { deprecated: 0.1 };

/** The share of a package on one measure. */
export interface Share {
  readonly metric: Metric;
  readonly value: number;
  readonly source: string;
  readonly share: number;
}

/** One package in the priority order. */
export interface Ranked {
  readonly package: string;
  readonly family: string;
  readonly place: number;
  readonly score: number | null;
  readonly reach: number | null;
  readonly landing: number;
  readonly shares: readonly Share[];
  readonly reasons: readonly string[];
}

/** This function gives the newest row of each key, by the time of the source of the row. */
function newest<T extends { readonly source: string }>(rows: readonly T[], key: (row: T) => string, at: ReadonlyMap<string, string>): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) {
    const k = key(row);
    const old = out.get(k);
    if (old === undefined || (at.get(row.source) ?? "") > (at.get(old.source) ?? "")) out.set(k, row);
  }
  return out;
}

/** This function gives the packages of the catalog in their priority order, with the parts of each score. */
export function priorityOrder(catalog: Catalog): Ranked[] {
  const at = new Map(catalog.sources.map((s) => [s.id, s.at]));
  const usage = newest<UsageRow>(catalog.usage, (u) => `${u.package}\u0000${u.metric}`, at);
  const registry = newest<RegistryRow>(catalog.registry, (r) => r.package, at);

  const shares = new Map<string, Share[]>();
  for (const metric of METRICS) {
    const rows = [...usage.values()].filter((u) => u.metric === metric);
    const placed = ranks(rows.map((u) => u.value));
    rows.forEach((u, i) => {
      const share = ((placed[i] as number) - 0.5) / rows.length;
      const list = shares.get(u.package) ?? [];
      list.push({ metric, value: u.value, source: u.source, share });
      shares.set(u.package, list);
    });
  }

  const scored = catalog.packages.map((p) => {
    const mine = shares.get(p.name) ?? [];
    const reach = mine.length === 0 ? null : mine.reduce((sum, s) => sum + s.share, 0) / mine.length;
    const reasons: string[] = [];
    let landing = 1;
    const deprecated = registry.get(p.name)?.deprecated;
    if (deprecated !== undefined) {
      landing *= LANDING.deprecated;
      reasons.push(`deprecated on npm: ${deprecated}`);
    }
    if (reach === null) reasons.push("no measure of use yet");
    return { package: p.name, family: p.family, score: reach === null ? null : reach * landing, reach, landing, shares: mine, reasons };
  });

  scored.sort((a, b) => {
    if (a.score === null || b.score === null) {
      if (a.score !== b.score) return a.score === null ? 1 : -1;
    } else if (a.score !== b.score) return b.score - a.score;
    return a.package < b.package ? -1 : a.package > b.package ? 1 : 0;
  });
  return scored.map((row, i) => ({ ...row, place: i + 1 }));
}
