// The fix tests of socket.io-client on the fork mark1russell7/socket.io. They follow the upstream job
// ci-socket.io-client.yml: npm ci, then compile the dependencies, the client and the server.
// The full check is npm test of the package: format:check, compile and test:node.
import { command, mocha, type Item, type Spec } from "../lib/fix-test.ts";

/** An item: a finding, its fix branch, and the test file and the grep of mocha. An item with no test file runs no mocha test. */
export interface SocketIoItem extends Item {
  readonly file?: string;
  readonly grep?: string;
}

const pkg = "packages/socket.io-client";
const compile = (name: string, workspaces: readonly string[]) =>
  command(name, "npm", ["run", "compile", ...workspaces.map((workspace) => `--workspace=${workspace}`)]);

export const spec: Spec<SocketIoItem> = {
  fork: "mark1russell7/socket.io",
  upstream: "socketio/socket.io",
  branch: "main",
  partial: true,
  setup: [
    compile("compile-deps", ["engine.io-parser", "engine.io-client", "socket.io-parser"]),
    compile("compile-client", ["socket.io-client"]),
    compile("compile-dev-deps", ["engine.io", "socket.io-adapter", "socket.io"]),
  ],
  source: async () => [`${pkg}/lib`],
  rebuild: compile("compile-client", ["socket.io-client"]),
  targeted: (item) =>
    item.file === undefined || item.grep === undefined
      ? []
      : [
          command("test", "npx", ["--no-install", "mocha", "--import=tsx", "--require", "test/support/hooks.ts", "--exit", item.file, "--grep", item.grep], {
            cwd: pkg,
            timeout: 600_000,
            summary: mocha,
          }),
        ],
  full: [command("npm-test", "npm", ["test"], { cwd: pkg, summary: mocha })],
};
