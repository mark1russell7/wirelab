/**
 * A new read of the measures of use. `addReadings` gives the tables `sources` and `usage` with the new source and its
 * rows. The old rows stay, so the tables keep the history. The script `scripts/measures.ts` makes the readings.
 */
import type { Metric, Source, UsageRow } from "./schema.ts";

/** One value of one measure of one package, from a new read. */
export interface Reading {
  readonly package: string;
  readonly metric: Metric;
  readonly value: number;
}

/** The two tables that a new read of the measures changes. */
export interface UsageTables {
  readonly sources: readonly Source[];
  readonly usage: readonly UsageRow[];
}

/**
 * This function adds the source and one usage row for each reading. It throws an error when the tables already have
 * the source id, or when two readings give the same package and measure. `parseCatalog` checks the rest.
 */
export function addReadings(tables: UsageTables, source: Source, readings: readonly Reading[]): UsageTables {
  if (tables.sources.some((one) => one.id === source.id)) throw new Error(`The table sources already has the source ${source.id}.`);
  const seen = new Set<string>();
  for (const reading of readings) {
    const key = `${reading.package} | ${reading.metric}`;
    if (seen.has(key)) throw new Error(`Two readings give ${key}.`);
    seen.add(key);
  }
  const rows = readings.map((reading): UsageRow => ({ package: reading.package, source: source.id, metric: reading.metric, value: reading.value }));
  return { sources: [...tables.sources, source], usage: [...tables.usage, ...rows] };
}
