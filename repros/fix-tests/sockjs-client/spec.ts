// The fix tests of sockjs-client on the fork mark1russell7/sockjs-client.
// The full suite and the linter run on upstream first, as the baseline. The new test of an item runs with mocha.
// Upstream has 5 problems of eslint, so the summary of the linter gives the count: a fix must not change it.
import { command, matching, mocha, type Item, type Spec } from "../lib/fix-test.ts";

/** An item: a finding, its fix branch, and the grep of its new test in tests/node.js. */
export interface SockJsItem extends Item {
  readonly grep: string;
}

const full = command("full", "npm", ["test"], { timeout: 600_000, summary: mocha });
const lint = command("lint", "npm", ["run", "lint"], { summary: matching(/^✖ \d+ problems?/) });

export const spec: Spec<SockJsItem> = {
  fork: "mark1russell7/sockjs-client",
  upstream: "sockjs/sockjs-client",
  branch: "main",
  baseline: [full, lint],
  source: async () => ["lib"],
  targeted: (item) => [command("test", "npx", ["--no-install", "mocha", "--exit", "tests/node.js", "--grep", item.grep], { timeout: 600_000, summary: mocha })],
  full: [full, lint],
};
