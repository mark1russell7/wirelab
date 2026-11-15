// The fix tests of engine.io-client on the fork mark1russell7/socket.io. They follow the upstream job
// ci-engine.io-client.yml: npm ci, then compile engine.io-parser, engine.io-client and engine.io.
// The new test of an item runs with XHR and with fetch. The full checks are the three suites and format:check.
import { command, exitCode, mocha, type Item, type Spec } from "../lib/fix-test.ts";

/** An item: a finding, its fix branch, the test file of the new test and the grep of mocha. */
export interface EngineIoItem extends Item {
  readonly file: string;
  readonly grep: string;
}

const pkg = "packages/engine.io-client";
const compile = (name: string, workspace: string) => command(name, "npm", ["run", "compile", `--workspace=${workspace}`]);
const suite = (name: string, script: string) => command(name, "npm", ["run", script], { cwd: pkg, summary: mocha });

export const spec: Spec<EngineIoItem> = {
  fork: "mark1russell7/socket.io",
  upstream: "socketio/socket.io",
  branch: "main",
  partial: true,
  setup: [compile("compile-parser", "engine.io-parser"), compile("compile-client", "engine.io-client"), compile("compile-engine", "engine.io")],
  source: async () => [`${pkg}/lib`],
  rebuild: compile("compile-client", "engine.io-client"),
  targeted: (item) => {
    const args = ["--no-install", "mocha", "--exit", "--require", "test/support/hooks.js", item.file, "--grep", item.grep];
    return [
      command("xhr", "npx", args, { cwd: pkg, timeout: 600_000, summary: mocha }),
      command("fetch", "npx", args, { cwd: pkg, env: { USE_FETCH: "1" }, timeout: 600_000, summary: mocha }),
    ];
  },
  full: [
    suite("full-xhr", "test:node"),
    suite("full-fetch", "test:node-fetch"),
    suite("full-builtin-ws", "test:node-builtin-ws"),
    command("format", "npm", ["run", "format:check"], { cwd: pkg, summary: exitCode }),
  ],
};
