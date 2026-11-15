// The fix branches of socket.io-client 4.8.4 for F0059 to F0062.
// F0062 is a types finding. Its check runs tsc on check-F0062.ts with tsconfig.check-F0062.json of this folder.
// The script test:types of the package is "exit 0", and tsd fails on upstream main for other reasons, so the check does not use them.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { copy, fixTest, run, sequence, tsc, type Check } from "../../lib/fix-test.ts";
import { spec } from "../spec.ts";

const typesF0062: Check = {
  name: "tsc",
  summary: tsc,
  run: async (context) => {
    const test = join(context.root, "packages", "socket.io-client", "test");
    const files = [copy(join(context.here, "check-F0062.ts"), test), copy(join(context.here, "tsconfig.check-F0062.json"), test)];
    const pkg = join(context.root, "packages", "socket.io-client");
    const result = await sequence([
      () => run("npx", ["--no-install", "tsc", "--version"], { cwd: pkg }),
      () => run("npx", ["--no-install", "tsc", "-p", "test/tsconfig.check-F0062.json"], { cwd: pkg }),
    ]);
    // The files must not stay: format:check of npm test examines test/**/*.ts.
    for (const file of files) rmSync(file, { force: true });
    return result;
  },
};

await fixTest(spec, [
  { id: "F0059", branch: "fix/sio-client-zero-reconnection-options", file: "test/connection.ts", grep: "0 as the value of the reconnection options|zero attempts" },
  { id: "F0060", branch: "fix/sio-client-recovered-boolean", file: "test/connection-state-recovery.ts", grep: "should not be recovered" },
  { id: "F0061", branch: "fix/sio-client-url-no-scheme", file: "test/url.ts", grep: "no protocol and no location" },
  { id: "F0062", branch: "fix/sio-client-timeout-emitwithack-type", checks: [typesF0062] },
]);
