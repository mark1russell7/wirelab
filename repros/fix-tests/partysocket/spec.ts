// The fix tests of partysocket on the fork mark1russell7/partykit.
// The targeted checks are the test files that the branch changes, and tsc. The full checks are the full suite,
// oxlint and oxfmt --check. Some suites of partykit skip on GitHub Actions, so vitest runs without GITHUB_ACTIONS.
import { join } from "node:path";
import { exitCode, log, run, tsc, vitest, type Check, type Context, type Item, type Spec } from "../lib/fix-test.ts";

const src = "packages/partysocket/src";
const bin = (context: Context, name: string): string => join(context.root, "node_modules", ".bin", name);

async function changed(context: Context, path: string): Promise<string[]> {
  const r = await run("git", ["diff", "--name-only", context.base, "HEAD", "--", path], { cwd: context.root });
  return r.stdout.split("\n").filter((line) => line !== "");
}

function tests(name: string, all: boolean): Check {
  return {
    name,
    summary: vitest,
    run: async (context) => {
      const files = all ? [] : (await changed(context, `${src}/tests`)).map((file) => file.replace(/^packages\/partysocket\//, ""));
      return run(bin(context, "vitest"), ["--no-watch", "--maxWorkers=2", ...files], {
        cwd: join(context.root, "packages", "partysocket"),
        env: { GITHUB_ACTIONS: undefined },
      });
    },
  };
}

// When the check of the format fails, the formatter writes the files of the branch, and the diff goes to the log
// <finding>-fmt-diff. Then the tree is clean again.
const format: Check = {
  name: "fmt",
  summary: exitCode,
  run: async (context) => {
    const result = await run(bin(context, "oxfmt"), ["--check", "packages/partysocket", ".changeset"], { cwd: context.root });
    if (result.code !== 0) {
      const files = await changed(context, "packages/partysocket");
      await run(bin(context, "oxfmt"), [...files, ...(await changed(context, ".changeset"))], { cwd: context.root });
      log(`${context.id}-fmt-diff`, await run("git", ["diff"], { cwd: context.root }));
      await run("git", ["checkout", "--quiet", "--", "."], { cwd: context.root });
    }
    return result;
  },
};

export const spec: Spec<Item> = {
  fork: "mark1russell7/partykit",
  upstream: "cloudflare/partykit",
  branch: "main",
  source: async (context) => (await changed(context, src)).filter((file) => !file.includes("/tests/")),
  targeted: () => [
    tests("tests", false),
    { name: "tsc", summary: tsc, run: (context) => run(bin(context, "tsc"), ["-p", `${src}/tsconfig.json`], { cwd: context.root }) },
  ],
  full: [
    tests("full", true),
    { name: "lint", summary: exitCode, run: (context) => run(bin(context, "oxlint"), ["packages/partysocket"], { cwd: context.root }) },
    format,
  ],
};
