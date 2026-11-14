// The shared runner of the fix tests. A fix test clones a fork that has fix branches, and tests each branch:
// - the checks of the spec run on upstream first, as the baseline, when the spec has them;
// - the targeted checks run with the source of upstream (before) and with the source of the fix (after);
// - the full checks run with the fix.
// A package gives a spec as data (the folder <package>/spec.ts), and a group folder gives its items (its run.ts).
// The logs go to $OUT/<name>.txt. The summary goes to the standard output.
import { cpSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { runCommand } from "@procedures/shell/command";

/** The result of a command: its exit code, its standard output, and all of its output. */
export interface Result {
  readonly code: number;
  readonly stdout: string;
  readonly text: string;
}

/** The step of a fix test: the baseline on upstream, before the fix, after the fix, or the full checks. */
export type Phase = "base" | "before" | "after" | "full";

/** The data that a check gets. */
export interface Context {
  /** The group folder: the current directory of the fix test. */
  readonly here: string;
  /** The clone of the fork. */
  readonly root: string;
  /** The upstream ref, for example upstream/main. */
  readonly base: string;
  readonly phase: Phase;
  /** The finding of the item, or "base" for the baseline. */
  readonly id: string;
}

/** A check: a command, or a function that runs commands. The summary gives one line of its result. */
export interface Check {
  readonly name: string;
  readonly run: (context: Context) => Promise<Result>;
  readonly summary?: (result: Result) => string;
  /** The phases of a targeted check (the default is before and after). */
  readonly phases?: readonly Phase[];
}

/** An item: a finding and its fix branch. Its checks run as targeted checks. */
export interface Item {
  readonly id: string;
  readonly branch: string;
  readonly checks?: readonly Check[];
}

/** The spec of the fix tests of a package. */
export interface Spec<I extends Item> {
  /** The fork and the upstream repository, as owner/name. */
  readonly fork: string;
  readonly upstream: string;
  /** The default branch of upstream. */
  readonly branch: string;
  /** A partial clone (--filter=blob:none), for a large repository. */
  readonly partial?: boolean;
  /** The steps after the install. A failure stops the fix test. */
  readonly setup?: readonly Check[];
  /** The checks on upstream, before the items. */
  readonly baseline?: readonly Check[];
  /** The paths of the source that go back to upstream for the step before. */
  readonly source: (context: Context) => Promise<readonly string[]>;
  /** The build after each change of the source. A failure skips the item. */
  readonly rebuild?: Check;
  readonly targeted: (item: I) => readonly Check[];
  readonly full: readonly Check[];
}

/** The folder repros/ of the repository. */
export const repros: string = join(import.meta.dirname, "..", "..");

const outDir = process.env["OUT"];
if (outDir === undefined || outDir === "") throw new Error("the variable OUT is not set");
const out: string = outDir;

/** This function runs a command with an argument list and no shell. A command that does not end in time gets the code 124. */
export async function run(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env?: Readonly<Record<string, string | undefined>>; readonly timeout?: number },
): Promise<Result> {
  const timeout = options.timeout ?? 900_000;
  const r = await runCommand(command, { args, cwd: options.cwd, env: options.env ? { ...options.env } : undefined, timeout, keep: "tail" });
  const note = r.timedOut === true ? `\nThe command did not end in ${timeout} ms.` : r.error !== undefined ? `\n${r.error}` : "";
  return { code: r.timedOut === true ? 124 : r.exitCode, stdout: r.stdout, text: `${r.stdout}${r.stderr}${note}` };
}

/** This function runs commands in sequence until one fails, and gives all of their output. */
export async function sequence(steps: readonly (() => Promise<Result>)[]): Promise<Result> {
  let last: Result = { code: 0, stdout: "", text: "" };
  let text = "";
  for (const step of steps) {
    last = await step();
    text += last.text;
    if (last.code !== 0) break;
  }
  return { code: last.code, stdout: last.stdout, text };
}

/** This function gives a check that runs one command in a folder of the clone. */
export function command(
  name: string,
  cmd: string,
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly timeout?: number;
    readonly summary?: (result: Result) => string;
    readonly phases?: readonly Phase[];
  } = {},
): Check {
  const check: Check = {
    name,
    run: (context) => run(cmd, args, { cwd: join(context.root, options.cwd ?? "."), ...(options.env ? { env: options.env } : {}), ...(options.timeout ? { timeout: options.timeout } : {}) }),
  };
  return { ...check, ...(options.summary ? { summary: options.summary } : {}), ...(options.phases ? { phases: options.phases } : {}) };
}

/** This function writes the output of a command to $OUT/<name>.txt, with its exit code. */
export function log(name: string, result: Result): Result {
  writeFileSync(join(out, `${name}.txt`), `${result.text}\nexit=${result.code}\n`);
  return result;
}

/** This function copies a file of the repository to a folder, and makes the folder. */
export function copy(from: string, toDir: string, name: string = basename(from)): string {
  mkdirSync(toDir, { recursive: true });
  const to = join(toDir, name);
  cpSync(from, to);
  return to;
}

/** This function makes node_modules/<name> of the group folder a link to the clone, so a repro imports the clone. */
export function link(name: string): Check {
  return {
    name: `link ${name}`,
    run: async (context) => {
      const target = join(context.here, "node_modules", name);
      rmSync(target, { recursive: true, force: true });
      mkdirSync(join(context.here, "node_modules"), { recursive: true });
      symlinkSync(context.root, target, "dir");
      return { code: 0, stdout: "", text: `${target} -> ${context.root}\n` };
    },
  };
}

function lines(result: Result): string[] {
  return result.text
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split(/\r?\n|\r/)
    .map((line) => line.trim());
}

function failures(found: readonly string[]): string {
  const unique = [...new Set(found)].slice(0, 6);
  return unique.length > 0 ? ` | ${unique.join(" | ")}` : "";
}

/** This summary gives the exit code only. */
export const exitCode = (result: Result): string => `exit=${result.code}`;

/** This summary gives the last line of the output. */
export const lastLine = (result: Result): string => `${lines(result).filter((line) => line !== "").at(-1) ?? ""} | exit=${result.code}`;

/** This summary gives the counts of mocha and the titles of the failing tests. */
export function mocha(result: Result): string {
  const all = lines(result);
  const counts = all.filter((line) => /^\d+ (passing|failing|pending)/.test(line)).map((line) => line.replace(/ \(.*\)$/, ""));
  return `${counts.join(", ")}${failures(all.filter((line) => /^\d+\) \S/.test(line)))} | exit=${result.code}`;
}

/** This summary gives the lines Test Files, Tests and Errors of vitest. An unhandled error gives exit 1 when each test passes. */
export function vitest(result: Result): string {
  const counts = lines(result)
    .filter((line) => /^(Test Files|Tests|Errors)\s/.test(line))
    .map((line) => line.replace(/\s+/g, " "));
  return `${counts.join("; ")} | exit=${result.code}`;
}

/** This summary gives the counts of jasmine, the last count of karma for each browser, and the failing specs. */
export function jasmine(result: Result): string {
  const all = lines(result);
  const counts = all.filter((line) => /^\d+ specs?, \d+ failures?/.test(line));
  const browsers = new Map<string, string>();
  for (const line of all) {
    const m = /^(.+?): Executed (\d+ of \d+.*?)(?:\s*\(\d[\d.]* secs.*)?$/.exec(line);
    if (m?.[1] !== undefined && m[2] !== undefined) browsers.set(m[1], `${m[1]}: ${m[2]}`);
  }
  const totals = all.filter((line) => line.startsWith("TOTAL: "));
  return `${[...counts, ...browsers.values(), ...totals].join(", ")}${failures(all.filter((line) => /^\d+\) \S/.test(line)))} | exit=${result.code}`;
}

/** This summary gives the version of tsc and each error of tsc, one for each line. */
export function tsc(result: Result): string {
  const all = lines(result);
  const version = all.find((line) => line.startsWith("Version ")) ?? "";
  const errors = all.filter((line) => /error TS\d+/.test(line));
  const shown = errors.slice(0, 10).map((line) => `\n    ${line}`).join("");
  const more = errors.length > 10 ? `\n    (${errors.length - 10} more)` : "";
  return `${version}${version ? ", " : ""}${errors.length} errors | exit=${result.code}${shown}${more}`;
}

async function must(cmd: string, args: readonly string[], cwd: string): Promise<string> {
  const r = await run(cmd, args, { cwd, timeout: 600_000 });
  if (r.code !== 0) {
    console.log(`${cmd} ${args.join(" ")} failed (exit ${r.code}):\n${r.text.slice(-3000)}`);
    process.exit(1);
  }
  return r.stdout.trim();
}

async function report(label: string, check: Check, context: Context, name: string): Promise<Result> {
  const result = log(name, await check.run(context));
  console.log(`${label}: ${(check.summary ?? exitCode)(result)}`);
  return result;
}

async function gate(check: Check, context: Context, name: string): Promise<boolean> {
  const result = log(name, await check.run(context));
  if (result.code === 0) return true;
  console.log(`${check.name} failed (exit ${result.code}):\n${lines(result).slice(-30).join("\n")}`);
  return false;
}

/** This function runs the fix test of each item, in order. */
export async function fixTest<I extends Item>(spec: Spec<I>, items: readonly I[]): Promise<void> {
  const here = process.cwd();
  const root = join(here, basename(spec.fork));
  const base = `upstream/${spec.branch}`;
  const context = (phase: Phase, id: string): Context => ({ here, root, base, phase, id });
  const partial = spec.partial === true ? ["--filter=blob:none"] : [];
  await must("git", ["clone", "--quiet", ...partial, `https://github.com/${spec.fork}`, root], here);
  await must("git", ["remote", "add", "upstream", `https://github.com/${spec.upstream}`], root);
  await must("git", ["fetch", "--quiet", "upstream", spec.branch], root);
  console.log(`${base}: ${await must("git", ["rev-parse", base], root)}`);
  await must("git", ["checkout", "--quiet", "-B", "base", base], root);
  const install = command("npm-ci", "npm", ["ci", "--no-audit", "--no-fund"]);
  for (const check of [install, ...(spec.setup ?? [])]) {
    if (!(await gate(check, context("base", "base"), `setup-${check.name.replace(/\W+/g, "-")}`))) process.exit(1);
  }
  for (const check of spec.baseline ?? []) await report(`base ${check.name}`, check, context("base", "base"), `base-${check.name}`);
  if ((spec.baseline ?? []).length > 0) console.log();

  for (const item of items) {
    const checkout = await run("git", ["checkout", "--quiet", "--force", "-B", item.branch, `origin/${item.branch}`], { cwd: root });
    if (checkout.code !== 0) {
      console.log(`${item.id}: the checkout of ${item.branch} failed:\n${checkout.text}`);
      continue;
    }
    const current = (await run("git", ["merge-base", "--is-ancestor", base, "HEAD"], { cwd: root })).code === 0;
    console.log(`${item.id} branch ${item.branch} at ${await must("git", ["rev-parse", "--short", "HEAD"], root)}, base ${current ? "current" : "behind"}`);
    console.log(`${item.id} files: ${(await must("git", ["diff", "--name-only", base, "HEAD"], root)).split("\n").join(", ")}`);
    const paths = await spec.source(context("before", item.id));
    let built = true;
    for (const phase of ["before", "after"] as const) {
      if (paths.length > 0) await must("git", ["checkout", "--quiet", phase === "before" ? base : "HEAD", "--", ...paths], root);
      if (spec.rebuild !== undefined && !(await gate(spec.rebuild, context(phase, item.id), `${item.id}-${spec.rebuild.name}-${phase}`))) {
        built = false;
        break;
      }
      for (const check of [...spec.targeted(item), ...(item.checks ?? [])]) {
        if (!(check.phases ?? ["before", "after"]).includes(phase)) continue;
        await report(`${item.id} ${check.name} (${phase})`, check, context(phase, item.id), `${item.id}-${check.name}-${phase}`);
      }
    }
    if (built) {
      await must("git", ["checkout", "--quiet", "--force", item.branch], root);
      for (const check of spec.full) await report(`${item.id} ${check.name}`, check, context("full", item.id), `${item.id}-${check.name}`);
    }
    console.log();
  }
}
