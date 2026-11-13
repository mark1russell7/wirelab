/**
 * The rows of the catalog from a run: a source, the use rows and the registry rows. These functions are pure.
 */
import {
  type Catalog,
  type RawTables,
  type RegistryRow,
  type Source,
  type UsageRow,
  METRICS,
  type Metric,
  catalogProblems,
} from "@wirelab/catalog";
import type { Failure, Measured } from "./run.ts";

/** The new rows of a run. */
export interface RunRows {
  readonly source: Source;
  readonly usage: readonly UsageRow[];
  readonly registry: readonly RegistryRow[];
}

/** What the source of a run tells. */
export const WHAT =
  "The measure run of wirelab through polite-crawler: npm downloads (last week), deps.dev dependents of the default version, jsDelivr hits (last month) and the abbreviated npm registry document.";

/** This function gives the id of the source of a run at a time: `measure-` and the UTC day, hour and minute. */
export function sourceId(at: string): string {
  const time = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(at);
  if (time === null) throw new Error(`"${at}" is not a UTC time.`);
  return `measure-${time[1]!}-${time[2]!}${time[3]!}`;
}

/** The packages with no value of one measure: a metric, or `registry` for the registry rows. */
export interface Absent {
  readonly measure: Metric | "registry";
  readonly packages: readonly string[];
}

/** This function gives, for each metric and for the registry, the packages of the list that have no row. */
export function absentOf(names: readonly string[], usage: readonly UsageRow[], registry: readonly RegistryRow[]): Absent[] {
  const without = (rows: ReadonlyArray<{ readonly package: string }>): string[] => {
    const measured = new Set(rows.map((row) => row.package));
    return names.filter((name) => !measured.has(name));
  };
  return [
    ...METRICS.map((metric) => ({ measure: metric, packages: without(usage.filter((row) => row.metric === metric)) })),
    { measure: "registry" as const, packages: without(registry) },
  ];
}

/** This function gives the note of the source: the requests that failed and the packages with no value. */
function noteOf(names: readonly string[], usage: readonly UsageRow[], registry: readonly RegistryRow[], failures: readonly Failure[]): string {
  const counts = absentOf(names, usage, registry).map(({ measure, packages }) => `${measure} ${String(packages.length)}`);
  const parts = [`Packages with no value: ${counts.join(", ")}.`];
  if (failures.length > 0) parts.unshift(`${String(failures.length)} requests failed.`);
  return parts.join(" ");
}

/**
 * This function gives the rows of a run for the packages of the catalog. A row of a package that is not in the list
 * does not go into the catalog. The registry row needs the version of the tag `latest` and the time of the last change.
 */
export function runRows(measured: Measured, names: readonly string[], at: string): RunRows {
  const known = new Set(names);
  const source = sourceId(at);
  const usage: UsageRow[] = [];
  const add = (name: string, metric: Metric, value: number): void => {
    if (known.has(name)) usage.push({ package: name, source, metric, value });
  };
  for (const row of measured.downloads) add(row.package, "npm-downloads-week", row.downloads);
  for (const row of measured.dependents) {
    add(row.package, "deps-dev-dependents-direct", row.direct);
    add(row.package, "deps-dev-dependents-indirect", row.indirect);
  }
  for (const row of measured.hits) add(row.package, "jsdelivr-hits-month", row.hits);
  const registry: RegistryRow[] = [];
  for (const document of measured.documents) {
    const version = document.distTags["latest"];
    if (!known.has(document.package) || version === undefined || document.modified === null) continue;
    registry.push({
      package: document.package,
      source,
      version,
      packumentModified: document.modified.slice(0, 10),
      ...(document.latestDeprecated === null ? {} : { deprecated: document.latestDeprecated }),
    });
  }
  const note = noteOf(names, usage, registry, measured.failures);
  return { source: { id: source, at, what: WHAT, note }, usage, registry };
}

/** The tables that a run changes. */
export const RUN_TABLES = ["sources", "usage", "registry"] as const satisfies ReadonlyArray<keyof Catalog>;

/**
 * This function adds the rows of a run to the raw tables. It throws an error that lists each problem of the new tables,
 * so a run does not write tables that the catalog refuses.
 */
export function addRun(raw: RawTables, rows: RunRows): RawTables {
  const next: RawTables = {
    ...raw,
    sources: [...raw.sources, rows.source],
    usage: [...raw.usage, ...rows.usage],
    registry: [...raw.registry, ...rows.registry],
  };
  const problems = catalogProblems(next);
  if (problems.length > 0) throw new Error(`The tables of the run have problems:\n${problems.join("\n")}`);
  return next;
}
