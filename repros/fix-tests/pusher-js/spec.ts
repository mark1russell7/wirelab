// The fix tests of pusher-js on the fork mark1russell7/pusher-js.
// The unit suites (Node.js and the browsers of karma) and the format check run on upstream first, as the baseline.
// The new specs of an item run with jasmine on a Node.js bundle of the specs, with a filter.
import { join } from "node:path";
import { command, copy, jasmine, link, matching, repros, run, sequence, type Check, type Item, type Spec } from "../lib/fix-test.ts";

/** An item: a finding, its fix branch, and the jasmine filter of its new specs. */
export interface PusherItem extends Item {
  readonly filter: string;
}

/** This check builds the Node.js bundle of the clone, then runs the ledger repro of the item against it. */
export function repro(result: RegExp): Check {
  return {
    name: "repro",
    summary: matching(result),
    run: (context) => {
      const dir = join(context.here, "e2e");
      return sequence([
        () => run("make", ["node"], { cwd: context.root }),
        async () => {
          copy(join(repros, "pusher-js", context.id, "repro.ts"), dir);
          return run("node", ["repro.ts"], { cwd: dir, timeout: 120_000 });
        },
      ]);
    },
  };
}

const nodeUnit = command("node-unit", "make", ["node_unit"], { summary: jasmine });
const webUnit = command("web-unit", "make", ["web_unit"], { summary: jasmine });
const format = command("format", "npm", ["run", "check-format"]);

export const spec: Spec<PusherItem> = {
  fork: "mark1russell7/pusher-js",
  upstream: "pusher/pusher-js",
  branch: "master",
  // A repro imports pusher-js: node_modules/pusher-js of the group folder is a link to the clone.
  setup: [link("pusher-js")],
  baseline: [nodeUnit, webUnit, format],
  source: async () => ["src"],
  targeted: (item) => [
    {
      name: "specs",
      summary: jasmine,
      run: (context) =>
        sequence([
          () => run("node", ["node_modules/webpack/bin/webpack.js", "--config=spec/config/jasmine/webpack.unit.js"], { cwd: context.root }),
          () =>
            run(join(context.root, "node_modules", ".bin", "jasmine"), ["--config=spec/config/jasmine/unit.json", `--filter=${item.filter}`], {
              cwd: context.root,
            }),
        ]),
    },
  ],
  full: [nodeUnit, webUnit, format],
};
