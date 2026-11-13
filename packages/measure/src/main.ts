/**
 * The command of the measure run. It measures each package of the catalog, adds a source and its rows to the tables, and
 * writes the report of the run. Start it from the root of the repository:
 *
 *   pnpm exec tsx packages/measure/src/main.ts [--data <folder>] [--store <folder>] [--report <file>]
 *
 * `--data` is the folder of the tables. The default is the folder `data` of `@wirelab/catalog`. `--store` is the store of
 * the crawler. A second run within 12 hours reads the stored answers and sends no request again.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { TABLE_FILES, catalog, rawTables, tableText } from "@wirelab/catalog";
import { openCrawler } from "polite-crawler";
import { reportText } from "./report.ts";
import { RUN_TABLES, addRun, runRows } from "./rows.ts";
import { measurePackages } from "./run.ts";

const { values } = parseArgs({
  options: {
    data: { type: "string", default: fileURLToPath(new URL("./data/", import.meta.resolve("@wirelab/catalog"))) },
    store: { type: "string", default: ".cache/measure" },
    report: { type: "string" },
  },
});

const names = catalog.packages.map((row) => row.name);
const at = new Date().toISOString();
const crawler = openCrawler({ dir: values.store, renderer: false });
try {
  const measured = await measurePackages(crawler, names);
  const rows = runRows(measured, names, at);
  const next = addRun(rawTables, rows);
  for (const table of RUN_TABLES) {
    await writeFile(join(values.data, TABLE_FILES[table]), tableText(table, next[table] as readonly object[]));
  }
  const report = reportText(rows, names, measured.failures);
  if (values.report !== undefined) {
    await mkdir(dirname(values.report), { recursive: true });
    await writeFile(values.report, report);
  }
  process.stdout.write(report);
} finally {
  await crawler.close();
}
