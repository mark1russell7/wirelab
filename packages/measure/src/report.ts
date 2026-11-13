/**
 * The report of a run, in Markdown. The weekly workflow uses it as the text of its pull request.
 */
import { type RunRows, absentOf } from "./rows.ts";
import type { Failure } from "./run.ts";

/** The report lists this number of failed requests or fewer. */
export const LISTED_FAILURES = 50;

const cell = (text: string): string => text.replaceAll("|", "\\|").replaceAll("\n", " ");

const byRecipeAndUrl = (a: Failure, b: Failure): number => a.recipe.localeCompare(b.recipe) || a.url.localeCompare(b.url);

/** This function gives the report of a run: the count of each measure, the failed requests and the packages with no value. */
export function reportText(rows: RunRows, names: readonly string[], failures: readonly Failure[]): string {
  const lines = [`## The measure run ${rows.source.id}`, "", `${String(names.length)} packages, source time ${rows.source.at}.`, ""];
  lines.push("| Measure | Packages with a value | Packages with no value |", "| --- | --- | --- |");
  const absent = absentOf(names, rows.usage, rows.registry);
  for (const { measure, packages } of absent) {
    lines.push(`| ${measure} | ${String(names.length - packages.length)} | ${String(packages.length)} |`);
  }
  if (failures.length > 0) {
    lines.push("", `### Requests that failed (${String(failures.length)})`, "");
    lines.push("| Recipe | URL | Outcome | Status | Note |", "| --- | --- | --- | --- | --- |");
    for (const failure of [...failures].sort(byRecipeAndUrl).slice(0, LISTED_FAILURES)) {
      const note = cell(failure.note ?? "");
      lines.push(`| ${failure.recipe} | ${cell(failure.url)} | ${failure.outcome} | ${String(failure.status)} | ${note} |`);
    }
    if (failures.length > LISTED_FAILURES) lines.push("", `The list shows the first ${String(LISTED_FAILURES)}.`);
  }
  const lists = absent.filter(({ packages }) => packages.length > 0);
  if (lists.length > 0) {
    lines.push("", "### Packages with no value", "");
    for (const { measure, packages } of lists) lines.push(`- ${measure}: ${packages.map((name) => `\`${name}\``).join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}
