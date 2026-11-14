// The fix branches of partysocket, group-5: F0071 (two test files bind port 50136).
// The ledger repro reads the test files of a commit: the upstream commit before, the commit of the fix after.
import { join } from "node:path";
import { fixTest, matching, repros, run, type Check } from "../../lib/fix-test.ts";
import { spec } from "../spec.ts";

const portsF0071: Check = {
  name: "ports",
  summary: matching(/^(ports bound|no port)/),
  run: async (context) => {
    const ref = context.phase === "before" ? context.base : "HEAD";
    const commit = (await run("git", ["rev-parse", ref], { cwd: context.root })).stdout.trim();
    const repo = context.phase === "before" ? spec.upstream : spec.fork;
    return run("node", [join(repros, "partysocket", "F0071", "repro.ts"), commit, repo], { cwd: context.here, timeout: 120_000 });
  },
};

await fixTest(spec, [{ id: "F0071", branch: "fix/partysocket-test-port-clash", checks: [portsF0071] }]);
