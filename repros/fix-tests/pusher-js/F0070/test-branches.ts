// This script tests the fix branch of pusher-js F0070 on the fork mark1russell7/pusher-js, before and after the fix.
// First, the unit suites, the format check and the repro of the ledger run on upstream master, as the baseline.
// The argument is "<finding>|<branch>|<jasmine filter>". The script then:
// - runs the new specs with the src folder of upstream master (before), then with the fix (after);
// - runs the repro repros/pusher-js/F0070 against a node build of the fix;
// - runs the unit suites (make node_unit, make web_unit) and the format check with the fix.
// The logs go to $OUT/<name>.txt. The summary goes to the standard output.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Result {
  readonly code: number;
  readonly text: string;
}

const out = process.env.OUT;
if (!out) throw new Error("the variable OUT is not set");
const here = process.cwd();
const root = join(here, "pusher-js");
const repro = join(here, "..", "..", "..", "pusher-js", "F0070", "repro.ts");

function run(cmd: string, args: readonly string[], cwd = root): Result {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? 124, text: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function must(cmd: string, args: readonly string[], cwd = root): string {
  const r = run(cmd, args, cwd);
  if (r.code !== 0) {
    console.log(`${cmd} ${args.join(" ")} failed (exit ${r.code}):\n${r.text.slice(-3000)}`);
    process.exit(1);
  }
  return r.text.trim();
}

function log(name: string, r: Result): Result {
  writeFileSync(join(out as string, `${name}.txt`), `${r.text}\nexit=${r.code}\n`);
  return r;
}

// The counts of jasmine, the last count of karma for each browser, and the title of each failing spec.
function summary(r: Result): string {
  const lines = r.text.replace(/\u001b\[[0-9;]*m/g, "").split(/[\r\n]+/).map((l) => l.trim());
  const counts = lines.filter((l) => /^\d+ specs?, \d+ failures?/.test(l));
  const browsers = new Map<string, string>();
  for (const l of lines) {
    const m = /^(.+?): Executed (\d+ of \d+.*?)(?:\s*\(\d[\d.]* secs.*)?$/.exec(l);
    if (m) browsers.set(m[1] as string, `${m[1] as string}: ${m[2] as string}`);
  }
  const totals = lines.filter((l) => /^TOTAL: /.test(l));
  const failures = lines.filter((l) => /^\d+\) \S/.test(l));
  const parts = [...counts, ...browsers.values(), ...totals];
  return `${parts.join(", ")}${failures.length > 0 ? ` | ${[...new Set(failures)].join(" | ")}` : ""} | exit=${r.code}`;
}

// The new specs only: a node bundle of the specs, then jasmine with a filter.
function specs(filter: string): Result {
  const bundle = run("node", ["node_modules/webpack/bin/webpack.js", "--config=spec/config/jasmine/webpack.unit.js"]);
  if (bundle.code !== 0) return bundle;
  return run("node_modules/.bin/jasmine", ["--config=spec/config/jasmine/unit.json", `--filter=${filter}`]);
}

// The repro of the ledger against a node build of the current src folder. The last line gives the state after 20 s.
function e2e(): Result {
  const build = run("make", ["node"]);
  if (build.code !== 0) return build;
  const dir = join(here, "e2e");
  mkdirSync(dir, { recursive: true });
  copyFileSync(repro, join(dir, "repro.ts"));
  return run("node", ["repro.ts"], dir);
}

function lastLine(r: Result): string {
  const lines = r.text.trim().split("\n");
  return `${lines[lines.length - 1] ?? ""} | exit=${r.code}`;
}

const [arg] = process.argv.slice(2);
const [id, branch, filter] = (arg ?? "").split("|");
if (!id || !branch || !filter) throw new Error(`a bad argument: ${arg ?? ""}`);

must("git", ["clone", "--quiet", "https://github.com/mark1russell7/pusher-js", root], here);
must("git", ["remote", "add", "upstream", "https://github.com/pusher/pusher-js"]);
must("git", ["fetch", "--quiet", "upstream", "master"]);
console.log(`upstream master: ${must("git", ["rev-parse", "upstream/master"])}`);
must("git", ["checkout", "--quiet", "-B", "base", "upstream/master"]);
const install = log("npm-ci", run("npm", ["ci", "--no-audit", "--no-fund"]));
if (install.code !== 0) {
  console.log(`npm ci failed:\n${install.text.slice(-3000)}`);
  process.exit(1);
}
// The repro imports pusher-js: it resolves to the clone, so it runs the node build of the clone.
rmSync(join(here, "node_modules", "pusher-js"), { recursive: true, force: true });
symlinkSync(root, join(here, "node_modules", "pusher-js"), "dir");

console.log(`base node_unit: ${summary(log("base-node-unit", run("make", ["node_unit"])))}`);
console.log(`base web_unit: ${summary(log("base-web-unit", run("make", ["web_unit"])))}`);
console.log(`base check-format: exit=${log("base-format", run("npm", ["run", "check-format"])).code}`);
console.log(`base repro: ${lastLine(log("base-repro", e2e()))}`);
must("git", ["checkout", "--quiet", "--force", "base"]);
console.log();

must("git", ["checkout", "--quiet", "--force", "-B", branch, `origin/${branch}`]);
const current = run("git", ["merge-base", "--is-ancestor", "upstream/master", "HEAD"]).code === 0;
console.log(`${id} branch ${branch} at ${must("git", ["rev-parse", "--short", "HEAD"])}, base ${current ? "current" : "behind"}`);
console.log(`${id} files: ${must("git", ["diff", "--name-only", "upstream/master", "HEAD"]).split("\n").join(", ")}`);
must("git", ["checkout", "--quiet", "upstream/master", "--", "src"]);
console.log(`${id} before: ${summary(log(`${id}-before`, specs(filter)))}`);
must("git", ["checkout", "--quiet", "HEAD", "--", "src"]);
console.log(`${id} after: ${summary(log(`${id}-after`, specs(filter)))}`);
console.log(`${id} repro (after): ${lastLine(log(`${id}-repro`, e2e()))}`);
must("git", ["checkout", "--quiet", "--force", branch]);
console.log(`${id} node_unit (after): ${summary(log(`${id}-node-unit`, run("make", ["node_unit"])))}`);
console.log(`${id} web_unit (after): ${summary(log(`${id}-web-unit`, run("make", ["web_unit"])))}`);
console.log(`${id} check-format: exit=${log(`${id}-format`, run("npm", ["run", "check-format"])).code}`);
