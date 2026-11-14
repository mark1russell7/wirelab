// This script tests fix branches of sockjs-client on the fork mark1russell7/sockjs-client, before and after each fix.
// First, the full suite and the linter run on upstream main, as the baseline.
// Each argument is "<finding>|<branch>|<mocha grep>". For each argument:
// - the new test runs with the lib folder of upstream main (before), then with the fix (after);
// - the full suite (npm test) and the linter (npm run lint) run with the fix.
// The logs go to $OUT/<name>.txt. The summary goes to the standard output.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

interface Result {
  readonly code: number;
  readonly text: string;
}

const out = process.env.OUT;
if (!out) throw new Error("the variable OUT is not set");
const root = join(process.cwd(), "sockjs-client");

function run(cmd: string, args: readonly string[], cwd = root): Result {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
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

// The counts of mocha, and the title of each failing test.
function summary(r: Result): string {
  const lines = r.text.split("\n");
  const counts = lines.filter((l) => /^\s+\d+ (passing|failing|pending)/.test(l)).map((l) => l.trim().replace(/ \(.*\)$/, ""));
  const failures = lines.filter((l) => /^\s+\d+\) \S/.test(l)).map((l) => l.trim());
  return `${counts.join(", ")}${failures.length > 0 ? ` | ${[...new Set(failures)].join(" | ")}` : ""} | exit=${r.code}`;
}

const mocha = (grep: string): Result => run("npx", ["--no-install", "mocha", "--exit", "tests/node.js", "--grep", grep]);

must("git", ["clone", "--quiet", "https://github.com/mark1russell7/sockjs-client", root], process.cwd());
must("git", ["remote", "add", "upstream", "https://github.com/sockjs/sockjs-client"]);
must("git", ["fetch", "--quiet", "upstream", "main"]);
console.log(`upstream main: ${must("git", ["rev-parse", "upstream/main"])}`);
must("git", ["checkout", "--quiet", "-B", "base", "upstream/main"]);
const install = log("npm-ci", run("npm", ["ci", "--no-audit", "--no-fund"]));
if (install.code !== 0) {
  console.log(`npm ci failed:\n${install.text.slice(-3000)}`);
  process.exit(1);
}
console.log(`base full: ${summary(log("base-full", run("npm", ["test"])))}`);
console.log(`base lint: exit=${log("base-lint", run("npm", ["run", "lint"])).code}`);
console.log();

for (const arg of process.argv.slice(2)) {
  const [id, branch, grep] = arg.split("|");
  if (!id || !branch || !grep) throw new Error(`a bad argument: ${arg}`);
  must("git", ["checkout", "--quiet", "-B", branch, `origin/${branch}`]);
  const current = run("git", ["merge-base", "--is-ancestor", "upstream/main", "HEAD"]).code === 0;
  console.log(`${id} branch ${branch} at ${must("git", ["rev-parse", "--short", "HEAD"])}, base ${current ? "current" : "behind"}`);
  console.log(`${id} files: ${must("git", ["diff", "--name-only", "upstream/main", "HEAD"]).split("\n").join(", ")}`);
  must("git", ["checkout", "--quiet", "upstream/main", "--", "lib"]);
  console.log(`${id} before: ${summary(log(`${id}-before`, mocha(grep)))}`);
  must("git", ["checkout", "--quiet", "HEAD", "--", "lib"]);
  console.log(`${id} after: ${summary(log(`${id}-after`, mocha(grep)))}`);
  console.log(`${id} after (full): ${summary(log(`${id}-full`, run("npm", ["test"])))}`);
  console.log(`${id} lint: exit=${log(`${id}-lint`, run("npm", ["run", "lint"])).code}`);
  console.log();
}
