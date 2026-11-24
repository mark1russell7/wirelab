/**
 * The priority order of the catalog: the order in which the campaign tests the packages and sends their fixes.
 *
 * The order is a formula over the tables:
 *
 * 1. For each measure of use, the latest value of each package comes from its newest source.
 * 2. The share of a package on a measure is its place among the packages with that measure, from 0 to 1. The share
 *    is `(rank - 0.5) / n`, with the mean rank for equal values. A place does not depend on the unit of a measure.
 * 3. The reach of a package is the mean of its shares. A package with no measure has no reach, and it goes last.
 * 4. The chance that a fix lands multiplies the reach. A deprecated package has the factor `LANDING.deprecated`. A
 *    package in an archived repository has the factor `LANDING.archived`, but only when npm does not deprecate it. A
 *    package of an unmaintained repository has the factor `LANDING.unmaintained` on the same terms. A dormant package
 *    (its npm document did not change for `DORMANT_DAYS` before its registry source) has the factor
 *    `LANDING.dormant`, but not with a deprecation, an archived repository or an unmaintained repository. A repository that takes pull requests only from its collaborators has the factor `LANDING.collaboratorsOnly`. A
 *    package with a closed source has the factor `LANDING.closed`. A repository that refuses contributions that an AI made has the factor `LANDING.aiRefused`, and a repository
 *    with a CLA has the factor `LANDING.cla`. The latest policy row of each topic applies.
 *
 * npm downloads already count the installs that come through other packages, and the dependents of deps.dev count
 * the transitive dependents. Thus the reach includes transitive use.
 */
import { ranks } from "@mark1russell7/rigor-statistics";
import type { Catalog, Metric, Policy, PolicyTopic, RegistryRow, UsageRow } from "./schema.ts";
import { METRICS } from "./schema.ts";

/**
 * The factors of the chance that a fix lands.
 *
 * - `deprecated`: a deprecated package has no maintainer to release a fix. Its users still get the issue.
 * - `archived`: the repository takes no pull request. A deprecated package does not get this factor too.
 * - `unmaintained`: the owner states that they keep no maintenance, so nobody releases a fix. A deprecated package does
 *   not get this factor too.
 * - `dormant`: npm got no release of the package for `DORMANT_DAYS`, so a merged fix is not likely to reach users.
 *   It has the value of `unmaintained`, because the effect is the same: no release carries the fix.
 * - `collaboratorsOnly`: the repository takes pull requests only from its collaborators. The issue links the fix
 *   branch, and a maintainer must apply the fix.
 * - `closed`: the source is not public. The fix goes to the vendor as a report with no fix branch, and only the
 *   vendor can apply it.
 * - `aiRefused`: the repository refuses contributions that an AI made. The fix stays held until the policy changes.
 * - `cla`: the repository needs a CLA. The fix stays held until Mark decides about the CLA.
 */
export const LANDING: {
  readonly deprecated: number;
  readonly archived: number;
  readonly unmaintained: number;
  readonly dormant: number;
  readonly collaboratorsOnly: number;
  readonly closed: number;
  readonly aiRefused: number;
  readonly cla: number;
} = {
  deprecated: 0.1,
  archived: 0.1,
  unmaintained: 0.1,
  dormant: 0.1,
  collaboratorsOnly: 0.3,
  closed: 0.2,
  aiRefused: 0.2,
  cla: 0.5,
};

/**
 * The days with no change of the npm document of a package, before the day of its registry source, after which the
 * package is dormant. A release changes the document, so the package got no release in that time. A deprecation or a
 * new tag also changes it, so the test can miss a dormant package, but it does not mark an active one.
 */
export const DORMANT_DAYS: number = 3 * 365;

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

/** This function gives the latest policy row of each repository and topic, by the day of the check. */
function latestPolicies(policies: readonly Policy[]): Map<string, Policy> {
  const out = new Map<string, Policy>();
  for (const row of policies) {
    const k = `${row.repository} ${row.topic}`;
    const old = out.get(k);
    if (old === undefined || row.checked > old.checked) out.set(k, row);
  }
  return out;
}

/** This function gives the days from the last change of the npm document of a package to the time of its registry source. */
function dormantDays(row: RegistryRow, at: ReadonlyMap<string, string>): number {
  const source = at.get(row.source);
  if (source === undefined) return 0;
  return (Date.parse(source) - Date.parse(`${row.packumentModified}T00:00:00Z`)) / 86_400_000;
}

/** This function gives the packages of the catalog in their priority order, with the parts of each score. */
export function priorityOrder(catalog: Catalog): Ranked[] {
  const at = new Map(catalog.sources.map((s) => [s.id, s.at]));
  const usage = newest<UsageRow>(catalog.usage, (u) => `${u.package}\u0000${u.metric}`, at);
  const registry = newest<RegistryRow>(catalog.registry, (r) => r.package, at);
  const repositoryOf = new Map(catalog.packageRepositories.map((r) => [r.package, r.repository]));
  const policies = latestPolicies(catalog.policies);
  const policy = (name: string, topic: PolicyTopic): Policy | undefined => {
    const repository = repositoryOf.get(name);
    return repository === undefined ? undefined : policies.get(`${repository} ${topic}`);
  };

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
    const row = registry.get(p.name);
    const deprecated = row?.deprecated;
    if (deprecated !== undefined) {
      landing *= LANDING.deprecated;
      reasons.push(`deprecated on npm: ${deprecated}`);
    }
    const contributions = policy(p.name, "contributions");
    if (contributions?.value === "archived") {
      if (deprecated === undefined) landing *= LANDING.archived;
      reasons.push(`the repository ${contributions.repository} is archived (checked ${contributions.checked})`);
    } else if (contributions?.value === "unmaintained") {
      if (deprecated === undefined) landing *= LANDING.unmaintained;
      reasons.push(`the owner of ${contributions.repository} keeps no maintenance (checked ${contributions.checked})`);
    } else if (deprecated === undefined && row !== undefined && dormantDays(row, at) >= DORMANT_DAYS) {
      landing *= LANDING.dormant;
      reasons.push(`no release on npm for ${Math.floor(dormantDays(row, at) / 365)} years: the npm document is unchanged since ${row.packumentModified} (source ${row.source})`);
    }
    if (contributions?.value === "collaborators-only") {
      landing *= LANDING.collaboratorsOnly;
      reasons.push(`the repository ${contributions.repository} takes pull requests only from its collaborators (checked ${contributions.checked})`);
    } else if (contributions?.value === "closed") {
      landing *= LANDING.closed;
      reasons.push(`the source is closed, and only its vendor ${contributions.repository} can apply a fix (checked ${contributions.checked})`);
    }
    const ai = policy(p.name, "ai");
    if (ai?.value === "refused") {
      landing *= LANDING.aiRefused;
      reasons.push(`the repository ${ai.repository} refuses contributions that an AI made (checked ${ai.checked})`);
    }
    const cla = policy(p.name, "cla");
    if (cla?.value === "cla") {
      landing *= LANDING.cla;
      reasons.push(`the repository ${cla.repository} needs a CLA (checked ${cla.checked})`);
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
