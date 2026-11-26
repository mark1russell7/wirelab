/** The reports of the probes: each run of the rig writes its results as JSON for the workflow artifacts. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * This function writes `results` to the file of the environment variable `RIG_REPORT`, with the suffix `name` when it
 * has one. It writes nothing when the variable has no value.
 */
export function writeReport(results: readonly unknown[], name?: string): void {
  const report = process.env["RIG_REPORT"];
  if (report === undefined) return;
  const file = name === undefined ? report : report.replace(/.json$/, `-${name}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
}
