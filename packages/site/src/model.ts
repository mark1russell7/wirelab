/**
 * The model of the catalog page. It has the rows of the priority order with their family and their faults, the filter
 * of the rows, and the counts of the campaign. This module has no code of the DOM, so a test in Node.js examines it.
 */
import { wordSearch } from "@mark1russell7/text";
import {
  type Catalog,
  type Finding,
  type FindingKind,
  FINDING_KINDS,
  type Metric,
  priorityOrder,
  type Ranked,
  type Repository,
  type UpstreamRow,
  type UpstreamState,
  UPSTREAM_STATES,
} from "@wirelab/catalog";

/** One fault of a package, with the latest change of its state upstream. A fault with no upstream row has `null`. */
export interface Fault {
  readonly finding: Finding;
  readonly upstream: UpstreamRow | null;
}

/** One row of the page: a package in the priority order, with the title of its family and its faults. */
export interface Row {
  readonly ranked: Ranked;
  readonly familyTitle: string;
  readonly repository: Repository | null;
  readonly faults: readonly Fault[];
}

/** The words of each measure of use, as the page shows them. */
export const METRIC_WORDS: Readonly<Record<Metric, string>> = {
  "npm-downloads-week": "npm downloads in a week",
  "deps-dev-dependents-direct": "direct dependents on deps.dev",
  "deps-dev-dependents-indirect": "indirect dependents on deps.dev",
  "jsdelivr-hits-month": "jsDelivr hits in a month",
};

/** The words of each state of a fix upstream, as the page shows them. */
export const STATE_WORDS: Readonly<Record<UpstreamState, string>> = {
  "issue-open": "issue open",
  "pr-open": "fix in review",
  merged: "fix merged",
  released: "fix released",
  "held-cla": "held for a CLA",
  "held-ai-policy": "held for the AI rule",
  "reported-privately": "reported privately",
  "fixed-by-others": "fixed by others",
  declined: "declined",
  closed: "closed",
};

/** The states of a fix that is in the code upstream. */
export const LANDED: ReadonlySet<UpstreamState> = new Set<UpstreamState>(["merged", "released", "fixed-by-others"]);

/** This function gives the latest upstream row of each finding, by the time of the row. */
export function latestUpstream(rows: readonly UpstreamRow[]): Map<string, UpstreamRow> {
  const out = new Map<string, UpstreamRow>();
  for (const row of rows) {
    const old = out.get(row.finding);
    if (old === undefined || row.at > old.at) out.set(row.finding, row);
  }
  return out;
}

/** This function gives the rows of the page in the priority order of the catalog. */
export function catalogRows(catalog: Catalog): Row[] {
  const titles = new Map(catalog.families.map((f) => [f.id, f.title]));
  const repositories = new Map(catalog.repositories.map((r) => [r.id, r]));
  const repositoryOf = new Map(catalog.packageRepositories.map((r) => [r.package, repositories.get(r.repository) ?? null]));
  const latest = latestUpstream(catalog.upstream);
  const faults = new Map<string, Fault[]>();
  for (const finding of catalog.findings) {
    const list = faults.get(finding.package) ?? [];
    list.push({ finding, upstream: latest.get(finding.id) ?? null });
    faults.set(finding.package, list);
  }
  return priorityOrder(catalog).map((ranked) => ({
    ranked,
    familyTitle: titles.get(ranked.family) ?? ranked.family,
    repository: repositoryOf.get(ranked.package) ?? null,
    faults: faults.get(ranked.package) ?? [],
  }));
}

/** The choices of the chance that a fix lands: all packages, only the packages with no factor, or only the others. */
export const LANDING_CHOICES = ["all", "full", "lowered"] as const;

/** One choice of the chance that a fix lands. */
export type LandingChoice = (typeof LANDING_CHOICES)[number];

/** The filter of the page. An empty text and an empty family agree with each row. */
export interface Filter {
  readonly text: string;
  readonly family: string;
  readonly withFaults: boolean;
  readonly landing: LandingChoice;
}

/** The filter that agrees with each row. */
export const NO_FILTER: Filter = { text: "", family: "", withFaults: false, landing: "all" };

/** This function gives the rows that agree with the filter, in their order. The text searches the package names. */
export function filterRows(rows: readonly Row[], filter: Filter): Row[] {
  const agrees = wordSearch(filter.text);
  return rows.filter(
    (row) =>
      agrees(row.ranked.package) &&
      (filter.family === "" || row.ranked.family === filter.family) &&
      (!filter.withFaults || row.faults.length > 0) &&
      (filter.landing === "all" || (filter.landing === "full") === (row.ranked.landing === 1)),
  );
}

/** One bar of a chart of counts: a label and its count. */
export interface Bar {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

/** The counts of the campaign, for the line at the top of the page and its two charts. */
export interface Counts {
  readonly packages: number;
  readonly protocols: number;
  readonly families: number;
  readonly faults: number;
  readonly sent: number;
  readonly landed: number;
  readonly byKind: readonly Bar[];
  readonly byState: readonly Bar[];
  readonly newest: string;
}

/** The key of the bar of the faults that have no upstream row. */
export const NOT_SENT = "not-sent";

/** This function gives the counts of the campaign. Each chart has its bars with a count above 0, the largest first. */
export function campaignCounts(catalog: Catalog): Counts {
  const latest = latestUpstream(catalog.upstream);
  const kinds = new Map<FindingKind, number>(FINDING_KINDS.map((k) => [k, 0]));
  const states = new Map<string, number>([...UPSTREAM_STATES, NOT_SENT].map((s) => [s, 0]));
  for (const finding of catalog.findings) {
    kinds.set(finding.kind, (kinds.get(finding.kind) ?? 0) + 1);
    const state = latest.get(finding.id)?.state ?? NOT_SENT;
    states.set(state, (states.get(state) ?? 0) + 1);
  }
  const bars = (counts: Map<string, number>, label: (key: string) => string): Bar[] =>
    [...counts]
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({ key, label: label(key), count }))
      .sort((a, b) => b.count - a.count);
  const sent = catalog.findings.filter((f) => latest.has(f.id)).length;
  const landed = catalog.findings.filter((f) => {
    const state = latest.get(f.id)?.state;
    return state !== undefined && LANDED.has(state);
  }).length;
  return {
    packages: catalog.packages.length,
    protocols: catalog.protocols.length,
    families: catalog.families.length,
    faults: catalog.findings.length,
    sent,
    landed,
    byKind: bars(kinds, (k) => k),
    byState: bars(states, (s) => (s === NOT_SENT ? "no upstream report yet" : STATE_WORDS[s as UpstreamState])),
    newest: catalog.sources.reduce((day, s) => (s.at > day ? s.at : day), "").slice(0, 10),
  };
}

/** This function gives a share or a score from 0 to 1 with two decimal places. */
export function fixed2(value: number): string {
  return value.toFixed(2);
}

/** This function gives a large count in its short English form, for example "1.2M". */
export function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
