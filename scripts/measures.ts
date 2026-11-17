/**
 * The read of the measures of use of each package of the catalog, for the workflow `measures.yml`. The script reads
 * three free public APIs through the polite send of polite-crawler, one request at a time for each host:
 *
 * - The npm downloads API gives the downloads of the last week.
 * - deps.dev gives the direct and the indirect dependents of the default version.
 * - The jsDelivr data API gives the hits of the last month.
 *
 * The three sources are documented APIs, so the script reads no robots.txt. The script adds one source and its usage
 * rows to the files `sources.json` and `usage.json` of the catalog, in their canonical form. It writes a summary in
 * Markdown to `--summary`, or to the standard output. Without a reading, it writes no file and gives the exit code 1.
 *
 * Start: `node scripts/measures.ts [--summary=<file>] [--only=<count>]`
 */
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { errorMessage } from "@mark1russell7/text";
import {
  depsDevDependentsRequest,
  depsDevPackageRequest,
  downloadsRequests,
  extractDepsDevDependents,
  extractDepsDevPackage,
  extractDownloads,
  extractJsdelivrHits,
  jsdelivrHitsRequest,
  type Extracted,
  type Extractor,
  type MeasureRequest,
} from "@procedures/npm/measures";
import { realClock } from "polite-crawler/politeness";
import { politeGet } from "./polite-get.ts";
import { TABLE_FILES, addReadings, catalog, parseCatalog, rawTables, tableText, type Metric, type Reading, type Source } from "../packages/catalog/src/index.ts";

/** The User-Agent of each request. It names no person and no project. */
const USER_AGENT = "catalog-measures";
/** The shortest time between two requests to each host. The downloads API refused single requests after 43 packages on 2026-11-13. */
const INTERVAL_MS: Readonly<Record<string, number>> = { "api.npmjs.org": 3000, "api.deps.dev": 1000, "data.jsdelivr.com": 1000 };
const DATA = join(import.meta.dirname, "..", "packages", "catalog", "src", "data");

const option = (name: string): string | undefined => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const only = option("only");
const summaryFile = option("summary");
if (only !== undefined && !/^[1-9][0-9]*$/.test(only)) throw new Error(`--only=${only} is not a count of 1 or more.`);
const names = catalog.packages.map((one) => one.name).slice(0, only === undefined ? undefined : Number(only));

const started = realClock.now();
const log = (text: string): void => console.log(`${new Date(realClock.now()).toISOString()} ${text}`);
const get = politeGet({ userAgent: USER_AGENT, intervalMs: INTERVAL_MS, log });

/** The requests that failed after each try, with the reason of the last try. */
const failures: string[] = [];
/** The packages that each source does not know. */
const missing: { readonly downloads: string[]; readonly "deps.dev": string[]; readonly jsDelivr: string[] } = { downloads: [], "deps.dev": [], jsDelivr: [] };

/** This function sends one request of a measure and gives the body of its answer, or the reason of the last failure. */
async function fetchBody(request: MeasureRequest, what: string): Promise<{ readonly body: string } | { readonly reason: string }> {
  const got = await get(request, what);
  return "reason" in got ? got : { body: got.reply.body };
}

/**
 * This function sends one request of a measure and reads the answer with its extractor. An answer with an unknown
 * shape gets no second try. The function records each failure and gives `undefined` for it.
 */
async function call<Row>(request: MeasureRequest, extract: Extractor<Row>, what: string): Promise<Extracted<Row> | undefined> {
  const fetched = await fetchBody(request, what);
  if ("reason" in fetched) {
    failures.push(`${what}: ${fetched.reason}`);
    return undefined;
  }
  try {
    return extract(fetched.body, request.url);
  } catch (error) {
    failures.push(`${what}: ${errorMessage(error)}`);
    return undefined;
  }
}

const known = new Set(names);
const readings: Reading[] = [];
const add = (name: string, metric: Metric, value: number): void => {
  if (known.has(name)) readings.push({ package: name, metric, value });
};

async function readDownloads(): Promise<void> {
  const requests = downloadsRequests(names, "last-week");
  for (const [index, request] of requests.entries()) {
    const result = await call(request, extractDownloads, `the downloads, request ${String(index + 1)} of ${String(requests.length)}`);
    for (const row of result?.rows ?? []) add(row.package, "npm-downloads-week", row.downloads);
    missing.downloads.push(...(result?.missing ?? []));
  }
  log("the downloads API: done");
}

async function readDependents(): Promise<void> {
  for (const name of names) {
    const found = await call(depsDevPackageRequest(name), extractDepsDevPackage, `the deps.dev package ${name}`);
    const version = found?.rows[0]?.defaultVersion ?? null;
    if (found !== undefined && version === null) missing["deps.dev"].push(name);
    if (version === null) continue;
    const result = await call(depsDevDependentsRequest(name, version), extractDepsDevDependents, `the deps.dev dependents of ${name}@${version}`);
    for (const row of result?.rows ?? []) {
      add(row.package, "deps-dev-dependents-direct", row.direct);
      add(row.package, "deps-dev-dependents-indirect", row.indirect);
    }
    missing["deps.dev"].push(...(result?.missing ?? []));
  }
  log("deps.dev: done");
}

async function readHits(): Promise<void> {
  for (const name of names) {
    const result = await call(jsdelivrHitsRequest(name, "month"), extractJsdelivrHits, `the jsDelivr hits of ${name}`);
    for (const row of result?.rows ?? []) add(row.package, "jsdelivr-hits-month", row.hits);
  }
  log("jsDelivr: done");
}

log(`${String(names.length)} packages`);
await Promise.all([readDownloads(), readDependents(), readHits()]);

const at = `${new Date(started).toISOString().slice(0, 19)}Z`;
const source: Source = {
  id: `measures-${at.slice(0, 10)}`,
  at,
  what: "The npm downloads API (last week), the deps.dev dependents of the default version and the jsDelivr hits (last month), through polite-crawler.",
  note: `${String(names.length)} packages. Unknown: ${Object.entries(missing).map(([where, list]) => `${String(list.length)} to ${where}`).join(", ")}. Failed requests: ${String(failures.length)}.`,
};

const metrics = [...new Set(readings.map((one) => one.metric))];
const lines = [
  `## The measures of use, ${at}`,
  "",
  `${source.note ?? ""}`,
  "",
  "| Measure | Packages |",
  "| --- | --- |",
  ...metrics.map((metric) => `| \`${metric}\` | ${String(readings.filter((one) => one.metric === metric).length)} |`),
  "",
];
const withRepository = new Set(catalog.packageRepositories.map((one) => one.package));
const next = readings
  .filter((one) => one.metric === "npm-downloads-week" && !withRepository.has(one.package))
  .sort((a, b) => b.value - a.value)
  .slice(0, 30);
if (next.length > 0) {
  lines.push("### The packages without a repository, by weekly downloads", "", "| Package | Downloads |", "| --- | --- |");
  lines.push(...next.map((one) => `| \`${one.package}\` | ${String(one.value)} |`), "");
}
if (failures.length > 0) lines.push("### Failed requests", "", ...failures.map((one) => `- ${one}`), "");
for (const [where, list] of Object.entries(missing)) {
  if (list.length > 0) lines.push(`### Unknown to ${where}`, "", list.map((one) => `\`${one}\``).join(", "), "");
}
const summary = `${lines.join("\n")}\n`;
if (summaryFile === undefined) console.log(summary);
else await appendFile(summaryFile, summary);

if (readings.length === 0) {
  console.error("The read gave no measure, so the script writes no file.");
  process.exit(1);
}
const tables = addReadings({ sources: catalog.sources, usage: catalog.usage }, source, readings);
parseCatalog({ ...rawTables, ...tables });
await writeFile(join(DATA, TABLE_FILES.sources), tableText("sources", tables.sources));
await writeFile(join(DATA, TABLE_FILES.usage), tableText("usage", tables.usage));
log(`wrote ${String(readings.length)} usage rows of the source ${source.id}`);
