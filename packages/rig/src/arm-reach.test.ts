import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARMS_FILE, RIG, armReach, armRows, cutsTargets, importsOf, targetHomes } from "./arm-reach.ts";
import { ARMS, type Arm } from "./arms.ts";

/** The folder of the repository. */
const root = fileURLToPath(new URL("../../../", import.meta.url));

/** Each `.ts` file of `packages/rig/src`, with its path in the repository and its text. */
const texts = new Map(
  execFileSync("git", ["ls-files", `${RIG}/src`], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((path) => path.endsWith(".ts"))
    .map((path) => [path, readFileSync(`${root}${path}`, "utf8")] as const),
);

/** This function gives the ids of the arms that a change of `changed` reaches. */
const reached = (changed: readonly string[], baseArms: readonly Arm[] | undefined = ARMS, arms: readonly Arm[] = ARMS): string[] => [
  ...armReach({ arms, baseArms, changed, texts }).keys(),
];

const all = ARMS.map((arm) => arm.id);
const ofClass = (id: string): string[] => ARMS.filter((arm) => arm.class === id).map((arm) => arm.id);
const src = (path: string): string => `${RIG}/src/${path}`;

describe("the reach of a sample change", () => {
  it("of a target file is the arms of its targets", () => {
    expect(reached([src("targets/stompjs.ts")])).toEqual(["stompjs-763"]);
    expect(reached([src("targets/aws-sdk-s3.ts")])).toEqual(["smithy-typescript-2377", "sockjs-client-c016", "smithy-typescript-2376", "xml-builder-c001"]);
  });

  it("of a patch is its arm", () => {
    expect(reached([`${RIG}/arms/hls-js-c001.patch`])).toEqual(["hls-js-c001"]);
  });

  it("of a probe module or the test file of a class is the arms of that class", () => {
    expect(reached([src("probes/c003.ts")])).toEqual(["connect-c003"]);
    expect(reached([src("probes/c016.test.ts")])).toEqual(ofClass("C016"));
    expect(reached([src("probes/c017.test.ts")])).toEqual(ofClass("C017"));
  });

  it("of the reply probes is each arm of a class with a reply probe", () => {
    const replyClasses = ["C001", "C003", "C032", "C033", "C034"];
    expect(reached([src("probes/replies.test.ts")])).toEqual(ARMS.filter((arm) => replyClasses.includes(arm.class)).map((arm) => arm.id));
  });

  it("of a list of targets is each arm of a test file that imports the list", () => {
    expect(reached([src("targets/key-targets.ts")])).toEqual([...ofClass("C017"), ...ofClass("C001")].sort((a, b) => all.indexOf(a) - all.indexOf(b)));
  });

  it("of Markdown, or of a file that no arm imports, is no arm", () => {
    expect(reached([`${RIG}/README.md`, src("index.ts")])).toEqual([]);
  });

  it("of the file of the arms is each arm whose entry changes", () => {
    const changedBuild = ARMS.map((arm) => (arm.id === "msgpackr-243" ? { ...arm, build: `${arm.build} && true` } : arm));
    expect(reached([ARMS_FILE], ARMS, changedBuild)).toEqual(["msgpackr-243"]);
    expect(reached([ARMS_FILE], ARMS.filter((arm) => arm.id !== "js-bson-966"))).toEqual(["js-bson-966"]);
    // A new file of the arms has no entries before the change.
    expect([...armReach({ arms: ARMS, baseArms: undefined, changed: [ARMS_FILE], texts }).keys()]).toEqual(all);
    expect(reached([ARMS_FILE])).toEqual([]);
  });
});

describe("a change to shared code of the rig", () => {
  it("reaches each arm", () => {
    const shared = [src("outcome.ts"), src("arms.ts"), src("cuts.ts"), src("matrix.ts"), src("targets/target.ts"), src("probes/report.ts")];
    const config = [`${RIG}/package.json`, `${RIG}/vitest.config.ts`, "pnpm-lock.yaml", ".github/workflows/rig-arms.yml"];
    for (const path of [...shared, ...config]) expect(reached([path]), path).toEqual(all);
  });
});

describe("the closure of each arm", () => {
  const homes = targetHomes(texts, ARMS);

  it("has the home of each target and the probe module of the class", () => {
    for (const arm of ARMS) {
      const probe = src(`probes/${arm.class.toLowerCase()}.ts`);
      const own = arm.targets.flatMap((id) => homes.get(id) ?? []);
      for (const path of existsSync(`${root}${probe}`) ? [probe, ...own] : own) expect(reached([path]), `${arm.id} ${path}`).toContain(arm.id);
    }
  });

  it("leaves out the files of other targets only when each target has one home", () => {
    expect([...homes].filter(([, paths]) => paths.length > 1)).toEqual([]);
    // The ids of the sockjs-client targets come from the transports of the suite, so the arm has no cut.
    expect(ARMS.filter((arm) => !cutsTargets(arm, homes)).map((arm) => arm.id)).toEqual(["sockjs-client-c016"]);
  });

  it("agrees with the modules: each module that gives an arm target is its home or imports its home", async () => {
    const graph = new Map([...texts].map(([path, text]) => [path, importsOf(path, text)] as const));
    const imports = (from: string, to: string): boolean => {
      const seen = new Set<string>();
      const next = [from];
      for (let path = next.pop(); path !== undefined; path = next.pop()) {
        if (path === to) return true;
        if (!seen.has(path)) next.push(...(graph.get(path) ?? []));
        seen.add(path);
      }
      return false;
    };
    const ids = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.flatMap(ids);
      const id = (value as { readonly id?: unknown } | null)?.id;
      return typeof value === "object" && typeof id === "string" ? [id] : [];
    };
    const problems: string[] = [];
    for (const path of [...texts.keys()].filter((one) => one.startsWith(src("targets/")))) {
      const module = (await import(`${root}${path}`)) as Record<string, unknown>;
      for (const id of new Set(Object.values(module).flatMap(ids))) {
        const home = homes.get(id);
        if (home === undefined || home.length === 0) continue;
        if (!home.some((one) => imports(path, one))) problems.push(`${path} gives ${id}, and its home is ${home.join(", ")}.`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("the rows of the matrix", () => {
  it("give a base row and a fixed row for each arm", () => {
    const rows = armRows(ARMS);
    expect(rows).toHaveLength(ARMS.length * 2);
    const hls = ARMS.find((arm) => arm.id === "hls-js-c001");
    expect(rows.filter((row) => row.id === "hls-js-c001")).toEqual([
      expect.objectContaining({ kind: "base", commit: hls?.base, patch: "" }),
      expect.objectContaining({ kind: "fixed", commit: hls?.base, patch: hls?.patch }),
    ]);
    const stomp = ARMS.find((arm) => arm.id === "stompjs-763");
    expect(rows.find((row) => row.id === "stompjs-763" && row.kind === "fixed")).toEqual(expect.objectContaining({ commit: stomp?.fix, patch: "", copy: "esm6 bundles" }));
  });
});
