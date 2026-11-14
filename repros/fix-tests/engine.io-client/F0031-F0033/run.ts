// F0031 (abort the polling requests on close) and F0033 (the types of perMessageDeflate and send).
// Each item also runs its repro of the ledger against the build of the clone, before and after the fix.
import { join } from "node:path";
import { copy, fixTest, matching, repros, run, sequence, tsc, type Check } from "../../lib/fix-test.ts";
import { spec } from "../spec.ts";

// The repro of F0031 imports engine.io-client, so it runs from the root of the clone: the workspace link is the build.
const reproF0031: Check = {
  name: "repro",
  summary: matching(/^after 2 s/),
  run: async (context) => {
    copy(join(repros, "engine.io-client", "F0031", "repro.ts"), context.root, "repro-F0031.mts");
    return run("node", ["repro-F0031.mts"], { cwd: context.root, timeout: 60_000 });
  },
};

// The repro of F0033 checks the types of the build with its own tsconfig.repro.json.
const typesF0033: Check = {
  name: "tsc",
  summary: tsc,
  run: async (context) => {
    const dir = join(context.root, "types-F0033");
    copy(join(repros, "engine.io-client", "F0033", "repro.ts"), dir);
    copy(join(repros, "engine.io-client", "F0033", "tsconfig.repro.json"), dir);
    const bin = join(context.root, "node_modules", ".bin", "tsc");
    return sequence([() => run(bin, ["--version"], { cwd: dir }), () => run(bin, ["-p", "tsconfig.repro.json"], { cwd: dir })]);
  },
};

await fixTest(spec, [
  { id: "F0031", branch: "fix/eio-client-abort-polling-requests", file: "test/node.js", grep: "long-polling", checks: [reproF0031] },
  { id: "F0033", branch: "fix/eio-client-option-types", file: "test/connection.js", grep: "callback", checks: [typesF0033] },
]);
